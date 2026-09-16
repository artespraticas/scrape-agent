import { paymentMiddleware, Network } from "@x402/express";

const middleware = paymentMiddleware(
  process.env.SELLER_WALLET_ADDRESS,
  {
    "POST /api/scrape/x402": {
      price: "$0.01",
      network: Network.BaseMainnet,
      description: "Pay-per-use web scraping. Extract text, links, HTML or metadata from any public URL.",
    },
  },
  {
    facilitatorUrl: "https://facilitator.x402.org",
  }
);

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(402).json({
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
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: process.env.SELLER_WALLET_ADDRESS,
        },
        {
          scheme: "exact",
          network: "eip155:421614",
          amount: "10000",
          asset: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9",
          payTo: process.env.SELLER_WALLET_ADDRESS,
        },
        {
          scheme: "exact",
          network: "eip155:137",
          amount: "10000",
          asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
          payTo: process.env.SELLER_WALLET_ADDRESS,
        },
      ],
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, extract = "text" } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: "url is required" });
  }

  try {
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
      const desc = html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
      result = { title, description: desc, url };
    } else {
      result = html;
    }

    return res.json({ url, extract, result, statusCode: response.status });
  } catch (err) {
    return res.status(500).json({ error: "Scrape failed", detail: err.message });
  }
}
