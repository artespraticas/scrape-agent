import { scrapeUrl, ScrapeSchema } from "../../lib/scraper.js";

const walletAddress = process.env.X402_WALLET_ADDRESS ?? "0xYOUR_WALLET";
const network = process.env.X402_NETWORK ?? "base";

const USDC_ADDRESS = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return json({ error: "Use POST" }, 405);
  }

  const paymentHeader = req.headers.get("X-PAYMENT");

  if (!paymentHeader) {
    return new Response(JSON.stringify({
      x402Version: 1,
      error: "Payment required",
      accepts: [{
        scheme: "exact",
        network,
        maxAmountRequired: "10000",
        resource: "/api/scrape/x402",
        description: "Pay-per-use web scraping — $0.01 per request",
        mimeType: "application/json",
        payTo: walletAddress,
        maxTimeoutSeconds: 300,
        asset: USDC_ADDRESS[network],
        outputSchema: null,
      }],
    }), {
      status: 402,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const parsed = ScrapeSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Validation failed", issues: parsed.error.flatten() }, 422);
  }

  const result = await scrapeUrl(parsed.data);
  return json({ protocol: "x402", priceUSD: "0.01", ...result });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT, X-PAYMENT-RESPONSE",
  };
}
