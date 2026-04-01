import { scrapeUrl, ScrapeSchema } from "../../lib/scraper.js";

const WALLET = "0x0d4897bf4222deddf8a5b31fa7d8021c369f40d1";
const NETWORK = "base";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT, X-PAYMENT-RESPONSE",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  if (req.method !== "POST") {
    return json({ error: "Use POST with a JSON body containing a url field" }, 405);
  }

  const paymentHeader = req.headers.get("X-PAYMENT");

  if (!paymentHeader) {
    return new Response(JSON.stringify({
      x402Version: 1,
      error: "Payment required",
      accepts: [{
        scheme: "exact",
        network: NETWORK,
        maxAmountRequired: "10000",
        resource: "/api/scrape/x402",
        description: "Pay-per-use web scraping — $0.01 per request",
        mimeType: "application/json",
        payTo: WALLET,
        maxTimeoutSeconds: 300,
        asset: USDC,
        outputSchema: null,
      }],
    }), {
      status: 402,
      headers: { "Content-Type": "application/json", ...cors() },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = ScrapeSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Validation failed", issues: parsed.error.flatten() }, 422);
  }

  const result = await scrapeUrl(parsed.data);
  return json({ protocol: "x402", priceUSD: "0.01", ...result });
}

export const config = {
  runtime: "edge",
};
```

---

## Step 6 — `public/llms.txt`

Create folder `public`, then file `public/llms.txt` with:
```
# Scrape Agent — x402 Pay-Per-Use Web Scraper

## Service
- Name: Scrape Agent
- URL: https://scrape-agent.vercel.app
- Protocol: x402
- Price: $0.01 USDC per request
- Network: Base mainnet

## Endpoint
POST https://scrape-agent.vercel.app/api/scrape/x402

## Payment
- Asset: USDC on Base
- Amount: 0.01 USD (10000 units)
- PayTo: 0x0d4897bf4222deddf8a5b31fa7d8021c369f40d1

## Usage
Send a POST request with JSON body:
{ "url": "https://example.com", "extract": "text" }

Extract options: text, html, links, meta, full
