import { scrapeUrl, ScrapeSchema } from "../../lib/scraper.js";

const WALLET = "0x0d4897bf4222deddf8a5b31fa7d8021c369f40d1";
const NETWORK = "base";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const PAYMENT_RESPONSE = {
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
    outputSchema: {
      input: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", format: "uri", description: "The URL to scrape" },
          extract: { type: "string", enum: ["text", "html", "links", "meta", "full"], default: "text" }
        }
      },
      output: {
        type: "object",
        properties: {
          url: { type: "string" },
          status: { type: "string" },
          title: { type: "string" },
          content: { type: "string" },
          wordCount: { type: "number" },
          elapsed: { type: "number" }
        }
      }
    }
  }]
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT, X-PAYMENT-RESPONSE",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

function pay402() {
  return new Response(JSON.stringify(PAYMENT_RESPONSE), {
    status: 402,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  // Return 402 for GET — this is what x402scan probes with
  if (req.method === "GET") {
    return pay402();
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const paymentHeader = req.headers.get("X-PAYMENT");
  if (!paymentHeader) {
    return pay402();
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
