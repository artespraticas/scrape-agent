export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    openapi: '3.1.0',
    info: {
      title: 'ScrapeAgent',
      version: '1.0.0',
      description: 'Pay-per-use web scraping API for AI agents. Supports x402 and MPP payment on Base, Arc, and Polygon.',
      'x-guidance': 'Send POST /api/scrape/x402 with JSON body { url: string }. Pay $0.01 USDC via x402 or MPP. No API key needed. Accepts Base (eip155:8453), Arc (eip155:5042), Polygon (eip155:137).',
      'x-payment-info': {
        price: { mode: 'fixed', currency: 'USD', amount: '0.010000' },
        protocols: [{ x402: {} }, { mpp: {} }],
        networks: ['eip155:8453', 'eip155:5042', 'eip155:137']
      },
      contact: { email: 'artespraticas@gmail.com', url: 'https://scrapeagent.xyz' },
      externalDocs: { url: 'https://scrapeagent.xyz/llms.txt', description: 'Agent usage guide' }
    },
    servers: [{ url: 'https://scrapeagent.xyz' }],
    paths: {
      '/api/scrape/x402': {
        get: {
          operationId: 'scrapeUrlProbe',
          summary: 'Probe — returns 402 Payment Required with payment instructions',
          tags: ['Scraping'],
          security: [],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: '0.010000' },
            protocols: [{ x402: {} }, { mpp: { method: '', intent: '', currency: '' } }],
            networks: ['eip155:8453', 'eip155:5042', 'eip155:137']
          },
          responses: {
            '402': { description: 'Payment Required — send payment via x402 or MPP then POST' }
          }
        },
        post: {
          operationId: 'scrapeUrl',
          summary: 'Scrape a URL and return clean text',
          tags: ['Scraping'],
          security: [{ mpp: [] }],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: '0.010000' },
            protocols: [{ x402: {} }, { mpp: { method: '', intent: '', currency: '' } }],
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
                    format: { type: 'string', enum: ['text', 'html', 'links'], description: 'Output format (default: text)' }
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
    },
    components: {
      securitySchemes: {
        mpp: {
          type: 'http',
          scheme: 'mpp',
          description: 'MPP micropayment — $0.01 USDC via WWW-Authenticate challenge'
        }
      }
    }
  });
}
