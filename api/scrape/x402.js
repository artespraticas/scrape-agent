export default async function handler(req, res) {
  // Handle CORS preflight so browsers can call this endpoint directly.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Payment challenge. Do this before body validation so discovery clients receive 402.
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
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: process.env.SELLER_WALLET_ADDRESS,
        extra: {
          name: "USD Coin",
          version: "2",
          assetTransferMethod: "eip3009",
        },
      },
      {
        scheme: "exact",
        network: "eip155:5042",
        amount: "10000",
        maxAmountRequired: "10000",
        asset: "0x3600000000000000000000000000000000000000",
        payTo: process.env.SELLER_WALLET_ADDRESS,
        extra: {
          name: "USD Coin",
          version: "2",
          assetTransferMethod: "eip3009",
        },
      },
      {
        scheme: "exact",
        network: "eip155:137",
        amount: "10000",
        maxAmountRequired: "10000",
        asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        payTo: process.env.SELLER_WALLET_ADDRESS,
        extra: {
          name: "USD Coin",
          version: "2",
          assetTransferMethod: "eip3009",
        },
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

  try {
    let verifyRes;
    try {
      verifyRes = await fetch("https://x402.org/facilitator/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentPayload: paymentHeader,
          paymentRequirements: challenge.accepts,
        }),
      });
    } catch (fetchErr) {
      return res.status(500).json({ error: "Facilitator unreachable", detail: String(fetchErr) });
    }

    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      return res.status(402).json({
        ...challenge,
        error: err.invalidReason || err.error || "Payment verification failed",
      });
    }

    const verifyData = await verifyRes.json().catch(() => ({}));
    if (!verifyData.isValid) {
      return res.status(402).json({
        ...challenge,
        error: verifyData.invalidReason || "Payment invalid",
      });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "ScrapeAgent/1.0 (+https://scrapeagent.xyz)",
      },
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
      const desc =
        html.match(
          /name=["']description["'][^>]*content=["']([^"']+)["']/i
        )?.[1] || "";
      result = { title, description: desc, url };
    } else {
      result = html;
    }

    fetch("https://x402.org/facilitator/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentPayload: paymentHeader,
        paymentRequirements: challenge.accepts,
      }),
    }).catch(() => {});

    return res.json({ url, extract, result, statusCode: response.status });
  } catch (err) {
    return res.status(500).json({
      error: "Scrape failed",
      detail: err.message,
    });
  }
}
