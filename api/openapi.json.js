export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    openapi: '3.1.0',
    info: {
      title: 'ScrapeAgent',
      version: '1.0.0',
      description: 'Pay-per-use web scraping API for AI agents.',
      'x-guidance': 'Send POST /api/scrape/x402 with JSON body { url: string }. Pay $0.01 USDC via x402 or MPP. No API key needed.',
      contact: { email: 'artespraticas@gmail.com' },
      externalDocs: { url: 'https://scrapeagent.xyz/llms.txt' }
    },
    servers: [{ url: 'https://scrapeagent.xyz' }],
    paths: {
      '/api/scrape/x402': {
        post: {
          operationId: 'scrapeUrl',
          summary: 'Scrape a URL and return clean text',
          tags: ['Scraping'],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: '0.010000' },
            protocols: [
              { x402: {} },
              { mpp: { method: 'transfer', intent: 'pay', currency: '0x20c000000000000000000000b9537d11c60e8b50' } }
            ]
          },
          extensions: {
            bazaar: {
              schema: {
                '$schema': 'https://json-schema.org/draft/2020-12/schema',
                properties: {
                  input: {
                    type: 'object',
                    required: ['url'],
                    properties: {
                      url: { type: 'string', format: 'uri', description: 'The URL to scrape' }
                    }
                  },
                  output: {
                    type: 'object',
                    required: ['url', 'text', 'length', 'scraped_at'],
                    properties: {
                      url: { type: 'string' },
                      text: { type: 'string' },
                      length: { type: 'number' },
                      scraped_at: { type: 'string', format: 'date-time' }
                    }
                  }
                },
                required: ['input']
              }
            }
          },
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url'],
                  properties: {
                    url: { type: 'string', format: 'uri', description: 'The URL to scrape' }
                  },
                  example: { url: 'https://example.com' }
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
                      scraped_at: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            },
            '402': { description: 'Payment Required — $0.01 USDC via x402 or MPP' },
            '400': { description: 'Missing url parameter' },
            '500': { description: 'Scrape failed' }
          }
        }
      }
    }
  });
}
