import { scrapeUrl, ScrapeSchema } from "../../lib/scraper.js";

const WALLET = "0x0d4897bf4222deddf8a5b31fa7d8021c369f40d1";
const NETWORK = "eip155:8453";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const ACCEPTS = [{
  scheme: "exact",
  network: NETWORK,
  amount: "10000",
  asset: USDC,
  payTo: WALLET,
  maxTimeoutSeconds: 300,
  extra: {
    name: "USDC",
    version: "2"
  }
}];

const PAYMENT_REQUIRED_BODY = {
  x402Version: 2,
  error: "Payment required",
  resource: {
    url: "https://scrapeagent.xyz/api/scrape/x402",
    description: "Pay-per-use web scraping — $0.01 per request",
    mimeType: "application/json"
  },
  accepts: ACCEPTS
};

function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
  const jsonStr = JSON.stringify(PAYMENT_REQUIRED_BODY);
  const encoded = encodeBase64(jsonStr);
  return new Response(jsonStr, {
    status: 402,
    headers: {
      "Content-Type": "application/json",
      "PAYMENT-REQUIRED": encoded,
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
