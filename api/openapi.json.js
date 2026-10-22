export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    openapi: '3.1.0',
    info: {
      title: 'ScrapeAgent',
      version: '2.0.0',
      description: 'Pay-per-use web scraping API for AI agents. $0.01 USDC per call via x402 on Base, Arc, and Polygon.',
      'x-guidance': 'Send POST /api/scrape/x402 with JSON body { url: string, format?: "text"|"html"|"links" }. Pay $0.01 USDC via x402 (GatewayWalletBatched) or MPP. Supported chains: Base (eip155:8453), Arc (eip155:5042), Polygon (eip155:137). No API key needed.',
      'x-payment-info': {
        price: { mode: 'fixed', currency: 'USD', amount: '0.010000' },
        protocols: [{ x402: {} }, { mpp: { method: 'POST', intent: 'pay', currency: 'USDC' } }],
        networks: ['eip155:8453', 'eip155:5042', 'eip155:137']
      },
      contact: { email: 'artespraticas@gmail.com', url: 'https://scrapeagent.xyz' },
      externalDocs: { url: 'https://scrapeagent.xyz/llms.txt', description: 'Agent usage guide' }
    },
    servers: [{ url: 'https://scrapeagent.xyz' }],
    paths: {
      '/api/scrape/x402': {
        get: {
          operationId: 'scrapeUrlDiscover',
          summary: 'Discover payment requirements',
          description: 'Returns 402 with payment requirements. Agents probe this before paying.',
          tags: ['Scraping'],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: '0.010000' },
            protocols: [{ x402: {} }, { mpp: { method: 'POST', intent: 'pay', currency: 'USDC' } }],
            networks: ['eip155:8453', 'eip155:5042', 'eip155:137']
          },
          responses: {
            '402': {
              description: 'Payment Required',
              headers: {
                'WWW-Authenticate': { schema: { type: 'string' }, description: 'MPP auth scheme' },
                'PAYMENT-REQUIRED': { schema: { type: 'string' }, description: 'Base64 x402 payment requirements' }
              }
            }
          }
        },
        post: {
          operationId: 'scrapeUrl',
          summary: 'Scrape a URL and return clean text',
          description: 'Scrapes a public URL and returns clean text, raw HTML, or extracted links. Requires $0.01 USDC payment via x402 (GatewayWalletBatched) on Base, Arc, or Polygon.',
          tags: ['Scraping'],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: '0.010000' },
            protocols: [{ x402: {} }, { mpp: { method: 'POST', intent: 'pay', currency: 'USDC' } }],
            networks: ['eip155:8453', 'eip155:5042', 'eip155:137']
          },
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url'],
                  properties: {
                    url: { type: 'string', format: 'uri', description: 'The URL to scrape' },
                    format: { type: 'string', enum: ['text', 'html', 'links'], description: 'Output format: text (default), html (raw), links (extracted URLs)' }
                  },
                  example: { url: 'https://example.com', format: 'text' }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Scrape successful',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['url', 'text', 'length', 'scraped_at'],
                    properties: {
                      url: { type: 'string' },
                      text: { type: 'string' },
                      length: { type: 'number' },
                      format: { type: 'string' },
                      scraped_at: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            },
            '402': { description: 'Payment Required' },
            '400': { description: 'Missing url parameter' },
            '500': { description: 'Scrape failed' }
          }
        }
      }
    }
  });
}
