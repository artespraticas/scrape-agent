// ScrapeAgent paid endpoint. Payments are verified AND settled by Circle Gateway
// (createGatewayMiddleware). Nothing is served for a payment that did not settle.
import express from "express";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";

const WALLET = process.env.WALLET_ADDRESS;
if (!WALLET) throw new Error("WALLET_ADDRESS env var required");

const gateway = createGatewayMiddleware({
  sellerAddress: WALLET,
  facilitatorUrl: "https://gateway-api.circle.com",
});
const gatewayMiddleware = gateway.require("$0.01");

// Bazaar schema: input.properties.body = request body schema, output.properties.example = response schema
const bodySchema = { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri", description: "The URL to scrape" }, format: { type: "string", enum: ["text","html","links"], description: "Output format (default: text)" } } };
const exampleSchema = { type: "object", required: ["url","text","length","scraped_at"], properties: { url: { type: "string" }, text: { type: "string" }, length: { type: "number" }, format: { type: "string" }, scraped_at: { type: "string", format: "date-time" } } };
const inputSchema = { properties: { body: bodySchema } };
const outputSchema = { properties: { example: exampleSchema } };

const RESOURCE_URL = "https://scrapeagent.xyz/api/scrape/x402";

// Options the Gateway verifier accepts: Gateway EIP-712 domain (GatewayWalletBatched,
// verifyingContract = Gateway Wallet) and a ~7 day validity window. Mirrors gateway.require().
const GATEWAY_WALLET = "0x77777777dcc4d5a8b6e418fd04d8997ef11000ee"; // arc-studio-allow-onchain-literal
const GATEWAY_EXTRA = { name: "GatewayWalletBatched", version: "1", verifyingContract: GATEWAY_WALLET };
const NETWORKS = [
  ["eip155:8453", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"], // Base  // arc-studio-allow-onchain-literal
  ["eip155:5042", "0x3600000000000000000000000000000000000000"], // Arc  // arc-studio-allow-onchain-literal
  ["eip155:137",  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"], // Polygon  // arc-studio-allow-onchain-literal
];
const accepts = NETWORKS.map(([network, asset]) => ({
  scheme: "exact", network, asset, amount: "10000", payTo: WALLET, maxTimeoutSeconds: 604900, extra: GATEWAY_EXTRA,
}));
const wwwAuth = [
  `MPP realm="scrapeagent.xyz"`,
  `payment-type="x402"`,
  `asset="USDC"`,
  `network="eip155:8453"`,
  `pay-to="${WALLET}"`,
  `amount="10000"`,
  `input-schema="${encodeURIComponent(JSON.stringify(inputSchema))}"`,
].join(", ");

const bazaar = {
  info: {
    input: { type: "http", method: "POST", bodyType: "json", body: { url: "https://example.com", format: "text" } },
    output: { type: "json", example: { url: "https://example.com", text: "Example Domain ...", length: 171, format: "text", scraped_at: "2026-11-03T12:00:00.000Z" } },
  },
  schema: { properties: { input: inputSchema, output: outputSchema } },
};

function send402(res) {
  const resource = { url: RESOURCE_URL, description: "Pay-per-use web scraping", mimeType: "application/json" };
  const v2payload = { x402Version: 2, resource, accepts, extensions: { bazaar } };
  res.setHeader("WWW-Authenticate", wwwAuth);
  res.setHeader("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(v2payload)).toString("base64"));
  // Body and header are built from the same object so clients never see different options
  return res.status(402).json({ error: "Payment required", ...v2payload });
}

const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT, PAYMENT-SIGNATURE, MCP-Session-Id");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, WWW-Authenticate");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// Capture the raw body before the Gateway middleware runs
app.use((req, _res, next) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    req.rawBody = raw;
    try { req.body = JSON.parse(raw); } catch { req.body = {}; }
    next();
  });
  req.on("error", next);
});

// Add the MPP challenge header to any 402 the Gateway middleware produces
const addMppHeader = (_req, res, next) => {
  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = function (statusCode, ...args) {
    if (statusCode === 402) this.setHeader("WWW-Authenticate", wwwAuth);
    return origWriteHead(statusCode, ...args);
  };
  next();
};

// GET always returns 402 so agents can discover payment requirements
app.get("/api/scrape/x402", (_req, res) => send402(res));

app.post(
  "/api/scrape/x402",
  (req, res, next) => {
    // No payment attached: return the full requirements (before any body validation)
    if (!(req.headers["x-payment"] || req.headers["payment-signature"])) return send402(res);
    next();
  },
  addMppHeader,
  gatewayMiddleware, // verifies and settles the payment; only calls next() when it succeeded
  async (req, res) => {
    const body = req.body || {};
    const url = body.url || req.query.url;
    if (!url) return res.status(400).json({ error: "Missing url" });
    const format = body.format || req.query.format || "text";
    try {
      const r = await fetch(url, { headers: { "User-Agent": "ScrapeAgent/1.0" }, signal: AbortSignal.timeout(8000) });
      const html = await r.text();
      let result;
      if (format === "html") {
        result = html.slice(0, 50000);
      } else if (format === "links") {
        const links = [...html.matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1]).filter((l) => l.startsWith("http")).slice(0, 200);
        result = links.join("\n");
      } else {
        result = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 10000);
      }
      return res.status(200).json({ url, text: result, length: result.length, format, scraped_at: new Date().toISOString() });
    } catch (err) {
      return res.status(500).json({ error: "Scrape failed", detail: err.message });
    }
  },
);

export default app;
