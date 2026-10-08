import { createCdpAuthHeaders } from "@coinbase/x402";

const WALLET = process.env.WALLET_ADDRESS;
const CDP_KEY_ID = process.env.CDP_API_KEY_ID;
const CDP_KEY_SECRET = process.env.CDP_API_KEY_SECRET;
const FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

const inputSchema = { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri", description: "The URL to scrape" } } };
const outputSchema = { type: "object", required: ["url","text","length","scraped_at"], properties: { url: { type: "string" }, text: { type: "string" }, length: { type: "number" }, scraped_at: { type: "string" } } };
const accepts = [
  { scheme: "exact", network: "eip155:8453", amount: "10000", maxAmountRequired: "10000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2", decimals: 6 }, outputSchema: { input: inputSchema, output: outputSchema } },
  { scheme: "exact", network: "eip155:5042", amount: "10000", maxAmountRequired: "10000", asset: "0x3600000000000000000000000000000000000000", payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2", decimals: 6 }, outputSchema: { input: inputSchema, output: outputSchema } },
  { scheme: "exact", network: "eip155:137", amount: "10000", maxAmountRequired: "10000", asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2", decimals: 6 }, outputSchema: { input: inputSchema, output: outputSchema } }
];

async function verifyAndSettle(paymentHeader) {
  try {
    const payment = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
    const authHeaders = await createCdpAuthHeaders(CDP_KEY_ID, CDP_KEY_SECRET)();
    const verifyRes = await fetch(FACILITATOR_URL + "/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ payment, paymentRequirements: accepts })
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.isValid) return { valid: false, reason: verifyData.invalidReason || JSON.stringify(verifyData) };
    const settleRes = await fetch(FACILITATOR_URL + "/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ payment, paymentRequirements: accepts })
    });
    const settleData = await settleRes.json();
    return { valid: true, settled: settleData };
  } catch(e) {
    return { valid: false, reason: e.message };
  }
}

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
  const result = await verifyAndSettle(paymentHeader);
  if (!result.valid) {
    const v2payload = { x402Version: 2, accepts };
    res.setHeader("payment-required", Buffer.from(JSON.stringify(v2payload)).toString("base64"));
    return res.status(402).json({ x402Version: 1, error: "Invalid payment: " + result.reason, resource, accepts });
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