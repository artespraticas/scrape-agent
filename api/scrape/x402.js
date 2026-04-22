import { scrapeUrl, ScrapeSchema } from "../../lib/scraper.js";

const WALLET = "0x0d4897bf4222deddf8a5b31fa7d8021c369f40d1";
const NETWORK = "eip155:8453";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const ACCEPTS = [{
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
}];

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT, X-PAYMENT-RESPONSE, PAYMENT-SIGNATURE, PAYMENT-REQUIRED, PAYMENT-RESPONSE",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

function pay402() {
  const body = JSON.stringify({
    x402Version: 2,
    error: "Payment required",
    accepts: ACCEPTS
  });

  return new Response(body, {
    status: 402,
    headers: {
      "Content-Type": "application/json",
      "Payment-Required": Buffer.from(JSON.stringify({
        x402Version: 2,
        accepts: ACCEPTS
      })).toString("base64"),
      ...cors()
    },
  });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  if (req.method === "GET") {
    return pay402();
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const paymentHeader =
    req.headers.get("PAYMENT-SIGNATURE") ||
    req.headers.get("X-PAYMENT");

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
  return json({ protocol: "x402", version: 2, priceUSD: "0.01", ...result });
}

export const config = {
  runtime: "edge",
};
