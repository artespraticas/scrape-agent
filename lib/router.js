import { createRouterFromEnv } from '@agentcash/router';

export const router = createRouterFromEnv({
  title: 'ScrapeAgent',
  description: 'Pay-per-use web scraping API for AI agents. $0.01 USDC per scrape via x402 or MPP.',
  guidance: 'Send GET /api/scrape/x402?url=https://example.com with x402 or MPP payment header. Returns clean text stripped of HTML.',
  contact: { email: 'artespraticas@gmail.com' },
  strictRoutes: true,
});
