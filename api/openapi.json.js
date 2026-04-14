export default function handler(req) {
  return new Response(JSON.stringify({
    openapi: "3.1.0",
    info: {
      title: "Scrape Agent",
      version: "1.0.0",
      "x-guidance": "This API scrapes any public URL and returns clean text, links, or HTML. Send a POST request to /api/scrape/x402 with a JSON body containing a 'url' field. Payment of $0.01 USDC on Base is required per request via x402 protocol. No API key needed — just pay and retry with the X-PAYMENT header."
    },
    paths: {
      "/api/scrape/x402": {
        post: {
          summary: "Scrape a URL",
          description: "Scrapes any public URL and returns extracted content",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url"],
                  properties: {
                    url: {
                      type: "string",
                      description: "The URL to scrape"
                    },
                    extract: {
                      type: "string",
                      enum: ["text", "html", "links", "meta", "full"],
                      default: "text",
                      description: "What to extract from the page"
                    },
                    timeout: {
                      type: "number",
                      default: 8000,
                      description: "Timeout in milliseconds (1000-15000)"
                    }
                  }
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Scrape successful"
            },
            "402": {
              description: "Payment Required — send 0.01 USDC on Base via x402"
            }
          },
          "x-payment-info": {
            protocols: ["x402"],
            price: {
              mode: "fixed",
              currency: "USD",
              amount: "0.01"
            }
          }
        }
      }
    }
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export const config = {
  runtime: "edge",
};
