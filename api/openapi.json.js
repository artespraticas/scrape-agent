export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    openapi: "3.1.0",
    info: {
      title: "ScrapeAgent",
      version: "1.1.0-preview",
      description: "Pay-per-use API for extracting readable text from public web pages.",
      "x-guidance": "POST /api/scrape/x402 with JSON body { url: string }. The current endpoint returns text only. The $0.01 USDC x402 payment challenge is authoritative for supported networks and recipient.",
      contact: { email: "artespraticas@gmail.com", url: "https://scrapeagent.xyz" },
      externalDocs: { url: "https://scrapeagent.xyz/llms.txt", description: "Agent usage guide" }
    },
    servers: [{ url: "https://scrapeagent.xyz" }],
    paths: {
      "/api/scrape/x402": {
        post: {
          operationId: "scrapeUrl",
          summary: "Extract readable text from a public URL",
          description: "Supports public HTTP(S) HTML or plain-text pages only. Redirects are rejected. Input is validated before a payment challenge. This preview is not production-approved until transport-level SSRF protection and end-to-end payment tests pass.",
          tags: ["Scraping"],
          "x-payment-info": {
            price: { mode: "fixed", currency: "USD", amount: "0.010000" },
            protocols: [{ x402: {} }]
          },
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  additionalProperties: false,
                  properties: {
                    url: { type: "string", format: "uri", description: "A public HTTP(S) URL; private/local targets and URLs with credentials are rejected." }
                  },
                  example: { url: "https://example.com" }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Text extraction completed and payment settlement succeeded",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["url", "text", "length", "scraped_at", "payment"],
                    properties: {
                      url: { type: "string" },
                      text: { type: "string", maxLength: 10000 },
                      length: { type: "integer" },
                      scraped_at: { type: "string", format: "date-time" },
                      payment: { type: "object", properties: { settled: { type: "boolean" }, network: { type: "string" } } }
                    }
                  }
                }
              }
            },
            "400": { description: "Missing, malformed, or unsafe URL" },
            "402": { description: "Payment required or invalid payment proof" },
            "405": { description: "Method not allowed" },
            "413": { description: "Target response exceeds size limit" },
            "415": { description: "Target content type is not HTML or plain text" },
            "422": { description: "Target returned an error, redirected, or contained no extractable text" },
            "502": { description: "Upstream scrape or settlement failed" }
          }
        }
      }
    }
  });
}
