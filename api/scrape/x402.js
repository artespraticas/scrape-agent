// arc-studio-allow-onchain-literal
import { createPublicClient, http, recoverAddress, hashTypedData } from "viem";
import { base, polygon } from "viem/chains";

// Arc Testnet chain definition (not in viem/chains — defined inline)
const arcTestnet = {
  id: 5042,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.arc.io"] } },
};

// Well-known USDC contract addresses per chain (public registry values)
// arc-studio-allow-onchain-literal
const CHAIN_CONFIG = {
  "eip155:8453":  { chain: base,       usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", name: "USD Coin", version: "2" },
  "eip155:137":   { chain: polygon,    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", name: "USD Coin", version: "2" },
  "eip155:5042":  { chain: arcTestnet, usdcAddress: "0x3600000000000000000000000000000000000000", name: "USD Coin", version: "2" },
};

const clients = {};
function getClient(network) {
  if (!clients[network]) {
    const cfg = CHAIN_CONFIG[network];
    if (!cfg) return null;
    clients[network] = createPublicClient({ chain: cfg.chain, transport: http() });
  }
  return clients[network];
}

async function verifyPayment(parsedPayload) {
  const { scheme, network, payload } = parsedPayload;
  if (scheme !== "exact") return { valid: false, reason: "unsupported_scheme" };
  const cfg = CHAIN_CONFIG[network];
  if (!cfg) return { valid: false, reason: `unsupported_network: ${network}` };

  const { signature, authorization } = payload;
  const { from, to, value, validAfter, validBefore, nonce } = authorization;

  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now < BigInt(validAfter))  return { valid: false, reason: "authorization_not_yet_valid" };
  if (now > BigInt(validBefore)) return { valid: false, reason: "authorization_expired" };

  const domain = {
    name: cfg.name,
    version: cfg.version,
    chainId: cfg.chain.id,
    verifyingContract: cfg.usdcAddress,
  };
  const types = {
    TransferWithAuthorization: [
      { name: "from",        type: "address" },
      { name: "to",          type: "address" },
      { name: "value",       type: "uint256" },
      { name: "validAfter",  type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce",       type: "bytes32" },
    ],
  };
  const message = {
    from, to,
    value:       BigInt(value),
    validAfter:  BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce,
  };

  const hash = hashTypedData({ domain, types, primaryType: "TransferWithAuthorization", message });
  const recovered = await recoverAddress({ hash, signature });
  if (recovered.toLowerCase() !== from.toLowerCase()) {
    return { valid: false, reason: "invalid_signature" };
  }

  // Best-effort balance check
  try {
    const client = getClient(network);
    const balance = await client.readContract({
      address: cfg.usdcAddress,
      abi: [{ name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }],
      functionName: "balanceOf",
      args: [from],
    });
    if (balance < BigInt(value)) return { valid: false, reason: "insufficient_balance" };
  } catch { /* proceed — on-chain tx will revert if needed */ }

  return { valid: true };
}

const SELLER = process.env.SELLER_WALLET_ADDRESS;

const ACCEPTS = [
  { scheme: "exact", network: "eip155:8453",  amount: "10000", maxAmountRequired: "10000", maxTimeoutSeconds: 300, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: SELLER, extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" } }, // arc-studio-allow-onchain-literal
  { scheme: "exact", network: "eip155:5042",  amount: "10000", maxAmountRequired: "10000", maxTimeoutSeconds: 300, asset: "0x3600000000000000000000000000000000000000", payTo: SELLER, extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" } }, // arc-studio-allow-onchain-literal
  { scheme: "exact", network: "eip155:137",   amount: "10000", maxAmountRequired: "10000", maxTimeoutSeconds: 300, asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", payTo: SELLER, extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" } }, // arc-studio-allow-onchain-literal
];

const CHALLENGE = {
  x402Version: 2,
  error: "Payment required",
  resource: { url: "https://scrapeagent.xyz/api/scrape/x402", description: "Pay-per-use web scraping — $0.01 per request", mimeType: "application/json" },
  accepts: ACCEPTS,
};

function extractContent(html, extract, url) {
  if (extract === "text") {
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || "";
    return { content: text, title, wordCount: text.split(/\s+/).filter(Boolean).length };
  }
  if (extract === "links") {
    const links = [...html.matchAll(/href=["']([^"'#][^"']*?)["']/g)]
      .map((m) => { try { return new URL(m[1], url).href; } catch { return m[1]; } })
      .filter((l) => l.startsWith("http"));
    return { links: [...new Set(links)], title: new URL(url).hostname };
  }
  if (extract === "html") {
    return { content: html, title: new URL(url).hostname };
  }
  if (extract === "meta") {
    const title   = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || "";
    const desc    = html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
    const ogTitle = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
    const ogDesc  = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
    const ogImage = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
    return { meta: { title, description: desc, ogTitle, ogDescription: ogDesc, ogImage }, title };
  }
  return { content: html };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT");

  if (req.method === "OPTIONS") return res.status(204).end();

  const paymentHeader = req.headers["x-payment"];

  if (req.method === "GET" || !paymentHeader) {
    res.setHeader("WWW-Authenticate", "Payment");
    return res.status(402).json(CHALLENGE);
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { url, extract = "text" } = req.body || {};
  if (!url) return res.status(400).json({ error: "url is required" });

  // Decode payment header
  let parsedPayload;
  try {
    parsedPayload = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
  } catch {
    return res.status(402).json({ ...CHALLENGE, error: "Invalid payment header encoding" });
  }

  // Verify payment
  try {
    const verification = await verifyPayment(parsedPayload);
    if (!verification.valid) {
      return res.status(402).json({ ...CHALLENGE, error: verification.reason });
    }
  } catch (err) {
    return res.status(402).json({ ...CHALLENGE, error: "Payment verification failed", detail: err.message });
  }

  // Scrape
  const t0 = Date.now();
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "ScrapeAgent/1.0 (+https://scrapeagent.xyz)" },
      signal: AbortSignal.timeout(20000),
    });
    const html = await response.text();
    const extracted = extractContent(html, extract, url);
    return res.json({ url, extract, elapsed: Date.now() - t0, statusCode: response.status, ...extracted });
  } catch (err) {
    return res.status(500).json({ error: "Scrape failed", detail: err.message });
  }
}
