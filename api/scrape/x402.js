import { createCdpAuthHeaders } from "@coinbase/x402";
import { validatePublicHttpUrl } from "../../lib/url-safety.js";

const WALLET = process.env.WALLET_ADDRESS;
const CDP_KEY_ID = process.env.CDP_API_KEY_ID;
const CDP_KEY_SECRET = process.env.CDP_API_KEY_SECRET;
const FACILITATOR_URL = "https://api.cdp.coinbase.com/platform/v2/x402";
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_TEXT_CHARS = 10_000;

const inputSchema = {
  type: "object",
  required: ["url"],
  properties: { url: { type: "string", format: "uri", description: "Public HTTP(S) URL to scrape" } }
};
const outputSchema = {
  type: "object",
  required: ["url", "text", "length", "scraped_at"],
  properties: {
    url: { type: "string" },
    text: { type: "string" },
    length: { type: "number" },
    scraped_at: { type: "string", format: "date-time" }
  }
};
const accepts = [
  { scheme: "exact", network: "eip155:8453", amount: "10000", maxAmountRequired: "10000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2", decimals: 6 }, outputSchema: { input: inputSchema, output: outputSchema } },
  { scheme: "exact", network: "eip155:5042", amount: "10000", maxAmountRequired: "10000", asset: "0x3600000000000000000000000000000000000000", payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2", decimals: 6 }, outputSchema: { input: inputSchema, output: outputSchema } },
  { scheme: "exact", network: "eip155:137", amount: "10000", maxAmountRequired: "10000", asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", payTo: WALLET, maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2", decimals: 6 }, outputSchema: { input: inputSchema, output: outputSchema } }
];

function paymentChallenge(res, resource, error = "Payment required") {
  const v2payload = { x402Version: 2, accepts };
  res.setHeader("payment-required", Buffer.from(JSON.stringify(v2payload)).toString("base64"));
  return res.status(402).json({ x402Version: 2, error, resource, accepts });
}

async function verifyPayment(paymentHeader) {
  try {
    const payment = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
    if (!payment || typeof payment !== "object" || !payment.accepted) {
      return { valid: false, reason: "Malformed payment payload" };
    }
    // Never let the caller choose arbitrary requirements to pass to the facilitator.
    // The selected requirement must match one of the exact terms advertised by this API.
    const chosen = payment.accepted;
    const matchesAdvertisedRequirement = accepts.some(option =>
      option.scheme === chosen.scheme &&
      option.network === chosen.network &&
      option.amount === chosen.amount &&
      option.maxAmountRequired === chosen.maxAmountRequired &&
      option.asset?.toLowerCase() === chosen.asset?.toLowerCase() &&
      option.payTo?.toLowerCase() === chosen.payTo?.toLowerCase()
    );
    if (!matchesAdvertisedRequirement) {
      return { valid: false, reason: "Payment terms do not match this service's advertised price, token, network, and recipient" };
    }
    const authHeaders = await createCdpAuthHeaders(CDP_KEY_ID, CDP_KEY_SECRET)();
    const verifyRes = await fetch(FACILITATOR_URL + "/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders.verify },
      body: JSON.stringify({
        x402Version: payment.x402Version || 2,
        paymentPayload: payment,
        paymentRequirements: payment.accepted
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (!verifyRes.ok) return { valid: false, reason: "Payment facilitator verification unavailable" };
    const verifyData = await verifyRes.json();
    if (!verifyData.isValid) {
      return { valid: false, reason: verifyData.invalidReason || "Payment verification failed" };
    }
    return { valid: true, payment, authHeaders };
  } catch {
    return { valid: false, reason: "Payment verification failed" };
  }
}

async function settlePayment(payment, authHeaders) {
  const settleRes = await fetch(FACILITATOR_URL + "/settle", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders.settle },
    body: JSON.stringify({
      x402Version: payment.x402Version || 2,
      paymentPayload: payment,
      paymentRequirements: payment.accepted
    }),
    signal: AbortSignal.timeout(5000)
  });
  if (!settleRes.ok) throw new Error("Payment settlement unavailable");
  const data = await settleRes.json();
  if (data?.success === false || data?.error) throw new Error("Payment settlement failed");
  return data;
}

async function readBodyLimited(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("The page is larger than the 1 MB limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(combined);
}

function htmlToText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT, PAYMENT-SIGNATURE");
  res.setHeader("Access-Control-Expose-Headers", "payment-required");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["POST", "GET"].includes(req.method)) {
    res.setHeader("Allow", "POST, GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const reqBody = req.method === "POST" ? req.body : null;
  const rawUrl = (reqBody && reqBody.url) || req.query?.url;
  if (!rawUrl || typeof rawUrl !== "string") {
    return res.status(400).json({ error: "Missing url. Supply a public HTTP(S) URL." });
  }

  let targetUrl;
  try {
    targetUrl = await validatePublicHttpUrl(rawUrl);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Invalid or unsafe URL." });
  }

  const host = req.headers.host || "scrapeagent.xyz";
  const resource = { url: "https://" + host + "/api/scrape/x402", description: "Pay-per-use public web text extraction", mimeType: "application/json" };
  const paymentHeader = req.headers["x-payment"] || req.headers["payment-signature"];
  if (!paymentHeader) return paymentChallenge(res, resource);

  const verification = await verifyPayment(paymentHeader);
  if (!verification.valid) {
    return paymentChallenge(res, resource, "Invalid payment: " + verification.reason);
  }

  try {
    // Redirects are deliberately rejected to prevent a redirect from bypassing URL checks.
    // DNS is checked before fetch; DNS rebinding remains a limitation until transport-level
    // address pinning or a controlled outbound proxy is configured.
    const upstream = await fetch(targetUrl.href, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": "ScrapeAgent/1.0 (+https://scrapeagent.xyz)", "Accept": "text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.1" },
      signal: AbortSignal.timeout(8000)
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      return res.status(422).json({ error: "Redirects are not supported for safety. Please submit the final public URL." });
    }
    if (!upstream.ok) {
      return res.status(422).json({ error: "The target page returned HTTP " + upstream.status + ". No successful extraction was produced." });
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!/^(text\/html|text\/plain|application\/xhtml\+xml)(\s*;|$)/i.test(contentType)) {
      return res.status(415).json({ error: "Unsupported content type. Only HTML and plain text pages are supported." });
    }

    const body = await readBodyLimited(upstream, MAX_RESPONSE_BYTES);
    const text = contentType.toLowerCase().startsWith("text/plain") ? body.trim().slice(0, MAX_TEXT_CHARS) : htmlToText(body);
    if (!text) return res.status(422).json({ error: "The page did not contain extractable text." });

    // Settlement is attempted only after extraction succeeds. If settlement fails, do not
    // return a successful paid response; clients should follow the facilitator's retry guidance.
    const settlement = await settlePayment(verification.payment, verification.authHeaders);
    return res.status(200).json({
      url: targetUrl.href,
      text,
      length: text.length,
      scraped_at: new Date().toISOString(),
      payment: { settled: true, network: settlement.network || verification.payment.accepted.network }
    });
  } catch (error) {
    const status = /larger than the 1 MB limit/.test(error?.message || "") ? 413 : 502;
    return res.status(status).json({
      error: status === 413 ? "Target response too large." : "Scrape or payment settlement failed.",
      detail: error?.message || "Unknown error"
    });
  }
}
