import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm";

const WALLET = process.env.WALLET_ADDRESS;
const inputSchema = { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri", description: "The URL to scrape" } } };
const outputSchema = { type: "object", required: ["url","text","length","scraped_at"], properties: { url: { type: "string" }, text: { type: "string" }, length: { type: "number" }, scraped_at: { type: "string" } } };

const facilitatorClient = new HTTPFacilitatorClient({ url: "https://facilitator.x402.org" });
const server = new x402ResourceServer([facilitatorClient]);
const scheme = new ExactEvmScheme();
server.register("eip155:8453", scheme);
server.register("eip155:5042", scheme);
server.register("eip155:137", scheme);

const accepts = [
  { scheme: "exact", network: "eip155:8453", maxAmountRequired: "10000", amount: "10000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: "USDC", version: "2" }, outputSchema: { input: inputSchema, output: outputSchema } },
  { scheme: "exact", network: "eip155:5042", maxAmountRequired: "10000", amount: "10000", asset: "0x3600000000000000000000000000000000000000", payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: "USDC", version: "2" }, outputSchema: { input: inputSchema, output: outputSchema } },
  { scheme: "exact", network: "eip155:137", maxAmountRequired: "10000", amount: "10000", asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: "USDC", version: "2" }, outputSchema: { input: inputSchema, output: outputSchema } }
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const host = req.headers.host || "api.scrapeagent.xyz";
  const resource = { url: "https://" + host + "/api/scrape/x402", description: "Pay-per-use web scraping", mimeType: "application/json" };
  const paymentHeader = req.headers["x-payment"] || req.headers["payment-signature"];
  if (!paymentHeader) {
    const v2payload = { x402Version: 2, accepts };
    res.setHeader("payment-required", Buffer.from(JSON.stringify(v2payload)).toString("base64"));
    return res.status(402).json({ x402Version: 1, error: "Payment required", resource, accepts });
  }
  try {
    const payment = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
    const verifyResult = await server.verifyPayment(payment, accepts);
    if (!verifyResult.valid) {
      const v2payload = { x402Version: 2, accepts };
      res.setHeader("payment-required", Buffer.from(JSON.stringify(v2payload)).toString("base64"));
      return res.status(402).json({ x402Version: 1, error: "Invalid payment", resource, accepts });
    }
    await server.settlePayment(payment, accepts);
  } catch(e) {
    console.error("Payment error:", e.message);
    const v2payload = { x402Version: 2, accepts };
    res.setHeader("payment-required", Buffer.from(JSON.stringify(v2payload)).toString("base64"));
    return res.status(402).json({ x402Version: 1, error: "Payment failed: " + e.message, resource, accepts });
  }
  const reqBody = req.method === "POST" ? req.body : null;
  const url = (reqBody && reqBody.url) || req.query.url;
  if (!url) return res.status(400).json({ error: "Missing url" });
  try {
    const r = await fetch(url, { headers: { "User-Agent": "ScrapeAgent/1.0" }, signal: AbortSignal.timeout(8000) });
    const html = await r.text();
    const text = html.replace(/<script[^>]*>[sS]*?<\/script>/gi,"").replace(/<style[^>]*>[sS]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,10000);
    return res.status(200).json({ url, text, length: text.length, scraped_at: new Date().toISOString() });
  } catch(err) { return res.status(500).json({ error: "Scrape failed", detail: err.message }); }
}