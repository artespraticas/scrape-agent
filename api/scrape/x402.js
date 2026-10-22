import { createGatewayMiddleware } from "@circle-fin/x402-batching";

const WALLET = process.env.WALLET_ADDRESS;

const inputSchema = { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri", description: "The URL to scrape" }, format: { type: "string", enum: ["text","html","links"], description: "Output format (default: text)" } } };
const outputSchema = { type: "object", required: ["url","text","length","scraped_at"], properties: { url: { type: "string" }, text: { type: "string" }, length: { type: "number" }, scraped_at: { type: "string" } } };

// arc-studio-allow-onchain-literal
const accepts = [
  { scheme: "GatewayWalletBatched", network: "eip155:8453",  amount: "10000", maxAmountRequired: "10000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2", decimals: 6 }, outputSchema: { input: inputSchema, output: outputSchema } },
  { scheme: "GatewayWalletBatched", network: "eip155:5042",  amount: "10000", maxAmountRequired: "10000", asset: "0x3600000000000000000000000000000000000000", payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2", decimals: 6 }, outputSchema: { input: inputSchema, output: outputSchema } }, // arc-studio-allow-onchain-literal
  { scheme: "GatewayWalletBatched", network: "eip155:137",   amount: "10000", maxAmountRequired: "10000", asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2", decimals: 6 }, outputSchema: { input: inputSchema, output: outputSchema } } // arc-studio-allow-onchain-literal
];

// Circle Gateway middleware — handles verification + settlement for all three chains
const gateway = createGatewayMiddleware({ sellerAddress: WALLET });

function send402(res, host) {
  const resource = { url: "https://" + host + "/api/scrape/x402", description: "Pay-per-use web scraping", mimeType: "application/json" };
  const v2payload = { x402Version: 2, accepts };
  res.setHeader("WWW-Authenticate", "MPP");
  res.setHeader("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(v2payload)).toString("base64"));
  return res.status(402).json({ x402Version: 1, error: "Payment required", resource, accepts });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT, PAYMENT-SIGNATURE");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();

  const host = req.headers.host || "scrapeagent.xyz";

  // GET — always return 402 so agents discover payment requirements
  if (req.method === "GET") return send402(res, host);

  // POST — run Circle Gateway middleware
  let gatewayPassed = false;
  await new Promise((resolve) => {
    gateway.require("$0.01")(req, res, () => { gatewayPassed = true; resolve(); });
    // If gateway calls res.end() directly (402/error), it won't call next()
    res.on("finish", resolve);
  });
  if (!gatewayPassed) return;

  // Read body (Vercel may pre-parse as Buffer)
  let body = req.body;
  if (Buffer.isBuffer(body)) {
    try { body = JSON.parse(body.toString("utf8")); } catch { body = {}; }
  }

  const url = (body && body.url) || req.query.url;
  if (!url) return res.status(400).json({ error: "Missing url" });

  const format = (body && body.format) || req.query.format || "text";

  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "ScrapeAgent/1.0" },
      signal: AbortSignal.timeout(8000)
    });
    const html = await r.text();

    let result;
    if (format === "html") {
      result = html.slice(0, 50000);
    } else if (format === "links") {
      const links = [...html.matchAll(/href=["']([^"']+)["']/g)].map(m => m[1]).filter(l => l.startsWith("http")).slice(0, 200);
      result = links.join("\n");
    } else {
      result = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 10000);
    }

    return res.status(200).json({
      url,
      text: result,
      length: result.length,
      format,
      scraped_at: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ error: "Scrape failed", detail: err.message });
  }
}
