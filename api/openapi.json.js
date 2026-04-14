export default function handler(req) {
  return new Response(JSON.stringify({
    openapi: "3.1.0",
    info: {
      title: "Scrape Agent",
      version: "1.0.0",
      "x-guidance": "x-guidance": "Send POST to /api/scrape/x402 with JSON body {url: string, extract?: text|html|links|meta|full}. Requires $0.01 USDC payment on Base via x402 v2 protocol. On 402 response, pay using X-PAYMENT header and retry."
