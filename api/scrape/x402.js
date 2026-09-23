import { createPublicClient, http, recoverAddress, hashTypedData } from "viem";
import { base, polygon } from "viem/chains";

// Chain configs for self-verification
const CHAIN_CONFIG = {
  "eip155:8453":  { chain: base,    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", name: "USD Coin", version: "2" },
  "eip155:137":   { chain: polygon, usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", name: "USD Coin", version: "2" },
};

// Lazy clients — created on first use per chain
const clients = {};
function getClient(network) {
  if (!clients[network]) {
    const cfg = CHAIN_CONFIG[network];
    if (!cfg) return null;
    clients[network] = createPublicClient({ chain: cfg.chain, transport: http() });
  }
  return clients[network];
}

/**
 * Self-verify a TransferWithAuthorization EIP-712 signature.
 * Returns { valid: true } or { valid: false, reason: string }
 */
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
    from,
    to,
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

  // Check balance on-chain
  const client = getClient(network);
  try {
    const balance = await client.readContract({
      address: cfg.usdcAddress,
      abi: [{ name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }],
      functionName: "balanceOf",
      args: [from],
    });
    if (balance < BigInt(value)) {
      return { valid: false, reason: "insufficient_balance" };
    }
  } catch {
    // Balance check failed — proceed anyway, the on-chain tx will revert if needed
  }

  return { valid: true };
}

export default async function handler(req, res) {
  // CORS — allow any browser to call this endpoint directly
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const paymentHeader = req.headers["x-payment"];

  const challenge = {
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: "https://scrapeagent.xyz/api/scrape/x402",
      description: "Pay-per-use web scraping — $0.01 per request",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount: "10000",
        maxAmountRequired: "10000",
        maxTimeoutSeconds: 300,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: process.env.SELLER_WALLET_ADDRESS,
        extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" },
      },
      {
        scheme: "exact",
        network: "eip155:5042",
        amount: "10000",
        maxAmountRequired: "10000",
        maxTimeoutSeconds: 300,
        asset: "0x3600000000000000000000000000000000000000",
        payTo: process.env.SELLER_WALLET_ADDRESS,
        extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" },
      },
      {
        scheme: "exact",
        network: "eip155:137",
        amount: "10000",
        maxAmountRequired: "10000",
        maxTimeoutSeconds: 300,
        asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        payTo: process.env.SELLER_WALLET_ADDRESS,
        extra: { name: "USD Coin", version: "2", assetTransferMethod: "eip3009" },
      },
    ],
  };

  if (req.method === "GET" || !paymentHeader) {
    res.setHeader("WWW-Authenticate", "Payment");
    return res.status(402).json(challenge);
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, extract = "text" } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: "url is required" });
  }

  // Decode and verify payment header
  let parsedPayload;
  try {
    parsedPayload = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
  } catch {
    return res.status(402).json({ ...challenge, error: "Invalid payment header encoding" });
  }

  try {
    const verification = await verifyPayment(parsedPayload);
    if (!verification.valid) {
      return res.status(402).json({ ...challenge, error: verification.reason });
    }
  } catch (err) {
    return res.status(402).json({ ...challenge, error: "Payment verification failed", detail: err.message });
  }

  // Payment verified — scrape the URL
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "ScrapeAgent/1.0 (+https://scrapeagent.xyz)" },
    });
    const html = await response.text();

    let result;
    if (extract === "text") {
      result = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    } else if (extract === "html") {
      result = html;
    } else if (extract === "links") {
      const matches = [...html.matchAll(/href=["']([^"']+)["']/g)];
      result = matches.map((m) => m[1]);
    } else if (extract === "meta") {
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1] || "";
      const desc = html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
      result = { title, description: desc, url };
    } else {
      result = html;
    }

    // Fire-and-forget: attempt settlement via x402 facilitator (best-effort)
    fetch("https://x402.org/facilitator/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: parsedPayload.x402Version ?? 1,
        paymentPayload: parsedPayload,
        paymentRequirements: challenge.accepts,
      }),
    }).catch(() => {});

    return res.json({ url, extract, result, statusCode: response.status });
  } catch (err) {
    return res.status(500).json({ error: "Scrape failed", detail: err.message });
  }
}
