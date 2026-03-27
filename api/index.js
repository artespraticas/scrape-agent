export default async function handler(req) {
  const info = {
    name: "ScrapeAgent API",
    version: "1.0.0",
    description: "Pay-per-use web scraping for AI agents. $0.01 per URL in USDC on Base.",
    paymentProtocols: ["x402 (Coinbase/Base)"],
    endpoints: [
      {
        path: "/api/scrape/x402",
        method: "POST",
        protocol: "x402",
        network: "base",
        currency: "USDC",
        price: "$0.01",
        description: "Scrape any public URL — returns text, links or metadata",
        schema: {
          url: "string (required)",
          extract: "text | html | links | meta | full (default: text)",
          timeout: "number (optional, ms, default 8000)",
        },
      },
    ],
    agentInstructions: "Install @x402/fetch, wrap fetch with withPaymentInterceptor, then call /api/scrape/x402",
    limits: {
      maxTimeout: "15 seconds",
      rateLimit: "none — pay per request",
    },
  };

  return new Response(JSON.stringify(info, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}
