import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm";

const WALLET = process.env.WALLET_ADDRESS;

const facilitatorClient = new HTTPFacilitatorClient({ url: "https://facilitator.x402.org" });
const server = new x402ResourceServer([facilitatorClient], [new ExactEvmScheme()], {
  "POST /api/scrape/x402": {
    accepts: [
      { scheme: "exact", network: "eip155:8453", maxAmountRequired: "10000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: WALLET },
      { scheme: "exact", network: "eip155:137", maxAmountRequired: "10000", asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", payTo: WALLET }
    ]
  }
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const paid = await server.handlePayment(req, res);
  if (!paid) return;
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