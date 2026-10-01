export default function handler(req, res) {
  return res.status(200).json({
    version: 1,
    resources: ["POST /api/scrape/x402"],
    name: "Scrape Agent",
    description:
      "Pay-per-use web scraping for AI agents — extract clean text, links, HTML or metadata from public URLs for $0.01 USD in USDC via x402 on Base or Polygon.",
  });
}

export const config = {
  runtime: "edge",
};
