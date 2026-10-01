export default function handler(req, res) {
  res.status(200).json({
    openapi: '3.1.0',
    info: {
      title: 'ScrapeAgent',
      version: '1.0.0',
      description: 'Pay-per-use web scraping API for AI agents. $0.01 USDC per scrape via x402 or MPP.',
      'x-guidance': 'Send GET /api/scrape/x402?url=https://example.com with x402 or MPP payment header. Returns clean text stripped of HTML.',
      contact: { email: 'artespraticas@gmail.com' },
      externalDocs: {
        description: 'Agent usage guide and examples',
        url: 'https://scrapeagent.xyz/llms.txt'
      }
    },
    servers: [{ url: 'https://scrapeagent.xyz' }],
    paths: {
      '/api/scrape/x402': {
        get: {
          operationId: 'scrapeUrl',
          summary: 'Scrape a URL and return clean text',
          tags: ['Scraping'],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: '0.010000' },
            protocols: [{ x402: {} }, { mpp: { method: '', intent: '', currency: '' } }]
          },
          parameters: [
            {
              name: 'url',
              in: 'query',
              required: true,
              schema: { type: 'string', format: 'uri', minLength: 1 },
              description: 'The URL to scrape'
            }
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url'],
                  properties: {
                    url: { type: 'string', format: 'uri', minLength: 1, description: 'The URL to scrape' }
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
                      url: { type: 'string', description: 'The scraped URL' },
                      text: { type: 'string', description: 'Clean text content stripped of HTML' },
                      length: { type: 'number', description: 'Character count of returned text' },
                      scraped_at: { type: 'string', format: 'date-time', description: 'Timestamp of scrape' }
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
