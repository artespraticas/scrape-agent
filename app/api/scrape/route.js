import { z } from 'zod';
import { router } from '@/lib/router';

const InputSchema = z.object({
  url: z.string().url().describe('The URL to scrape'),
});

const OutputSchema = z.object({
  url: z.string().describe('The scraped URL'),
  text: z.string().describe('Clean text content stripped of HTML'),
  length: z.number().describe('Character count of returned text'),
  scraped_at: z.string().describe('Timestamp of scrape'),
});

export const GET = router
  .route({ path: 'scrape' })
  .paid('0.01')
  .query(InputSchema)
  .output(OutputSchema)
  .inputExample({ url: 'https://example.com' })
  .description('Scrape any public URL and return clean text, stripped of HTML, scripts and styles.')
  .handler(async ({ query }) => {
    const response = await fetch(query.url, {
      headers: { 'User-Agent': 'ScrapeAgent/1.0 (+https://scrapeagent.xyz)' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await response.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10000);

    return { url: query.url, text, length: text.length, scraped_at: new Date().toISOString() };
  });
