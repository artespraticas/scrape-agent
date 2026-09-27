import { scrapeUrl, ScrapeSchema } from "../../lib/scraper.js";

const WALLET = "0x0d4897bf4222deddf8a5b31fa7d8021c369f40d1";
const FACILITATOR = "https://x402.org/facilitator";

const CHAINS = {
  "eip155:8453": {
    name: "Base",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  "eip155:5042": {
    name: "Arc Mainnet",
    usdc: "0x3600000000000000000000000000000000000000",
  },
  "eip155:137": {
    name: "Polygon",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8bC03d5c3359",
  }
};

const ACCEPTS = Object.entries(CHAINS).map(([network, chain]) => ({
  scheme: "exact",
  network,
  amount: "10000",
  asset: chain.usdc,
  payTo: WALLET,
  maxTimeoutSeconds: 300,
  extra: {
    name: "USDC",
    version: "2"
  }
}));

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

function pay402(extraError = null) {
  const body = {
    ...PAYMENT_REQUIRED_BODY,
    ...(extraError ? { error: extraError } : {})
  };
  const jsonStr = JSON.stringify(body);
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

async function verifyPayment(paymentHeader) {
  try {
    const response = await fetch(`${FACILITATOR}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body:
