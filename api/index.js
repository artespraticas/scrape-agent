export default function handler(req) {
  return new Response(JSON.stringify({
    name: "Scrape Agent",
    description: "Pay-per-use web scraping API using x402",
    version: "1.0.0",
    endpoints: [
      {
        path: "/api/scrape/x402",
        method: "POST",
        protocol: "x402",
        price: "$0.01 USDC",
        network: "Base",
        description: "Scrape any URL and return clean text, links, or HTML"
      }
    ],
    discovery: "https://scrape-agent.vercel.app/llms.txt"
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
