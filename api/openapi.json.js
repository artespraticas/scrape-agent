export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    openapi: '3.1.0',
    info: {
      title: 'ScrapeAgent',
      version: '1.0.0',
      description: 'Pay-per-use web scraping API for AI agents.',
      'x-guidance': 'Send POST /api/scrape/x402 with JSON body { url: string }. Pay $0.01 USDC via x402 or MPP. No API key needed.'
    },
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
              { mpp: { method: '', intent: '', currency: '' } }
            ]
          },
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url'],
                  properties: {
                    url: { type: 'string', minLength: 1, description: 'The URL to scrape' }
                  }
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
                      scraped_at: { type: 'string' }
                    }
                  }
                }
              }
            },
            '402': { description: 'Payment Required' }
          }
        }
      }
    }
  });
}
