export default function handler(req, res) {
  res.status(200).json({
    service: "ScrapeAgent API",
    version: "1.0.0",
    network: "base",
    endpoints: {
      scrape: {
        path: "/api/scrape/x402",
        method: "GET",
        price: "$0.01 USDC per scrape",
        protocol: "x402",
        params: { url: "URL to scrape" }
      }
    },
    llms_txt: "https://scrape-agent.vercel.app/llms.txt"
  });
}
