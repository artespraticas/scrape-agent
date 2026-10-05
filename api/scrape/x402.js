import { paymentMiddleware, Network, Resource } from "@coinbase/x402/next";

const resource = {
  description: "Pay-per-use web scraping — $0.01 per request",
  mimeType: "application/json",
};

export const middleware = paymentMiddleware(
  process.env.WALLET_ADDRESS,
  {
    "/api/scrape/x402": {
      price: "$0.01",
      network: Network.BaseMainnet,
      resource,
    },
  }
);

export default async function handler(req, res) {
  const url = (req.body && req.body.url) || req.query.url;
  if (!url) return res.status(400).json({ error: "Missing url" });
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "ScrapeAgent/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await r.text();
    const text = html
      .replace(/<script[^>]*>[sS]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[sS]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 10000);
    return res.status(200).json({ url, text, length: text.length, scraped_at: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: "Scrape failed", detail: err.message });
  }
}