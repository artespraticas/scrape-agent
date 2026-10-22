// ScrapeAgent MCP server — Streamable HTTP transport (JSON-RPC 2.0)
// Tools: scrape_url — $0.01 USDC via Circle Gateway
// initialize and tools/list are free; tools/call requires payment.
import { createGatewayMiddleware } from '@circle-fin/x402-batching';

const WALLET_ADDRESS = process.env.WALLET_ADDRESS;

const SCRAPE_TOOL = {
  name: 'scrape_url',
  description: 'Scrape clean text, links, or HTML from any public URL. Costs $0.01 USDC per call via x402 payment. No API key needed.',
  inputSchema: {
    type: 'object',
    required: ['url'],
    properties: {
      url: {
        type: 'string',
        description: 'Publicly accessible URL to scrape',
      },
      format: {
        type: 'string',
        enum: ['text', 'html', 'links'],
        description: 'Output format: text (default, clean readable text), html (raw HTML up to 50k chars), or links (all hrefs)',
      },
    },
  },
};

let gatewayMiddleware;
function getGateway() {
  if (!gatewayMiddleware) {
    gatewayMiddleware = createGatewayMiddleware({
      price: '$0.01',
      payTo: WALLET_ADDRESS,
      network: 'base-mainnet',
    });
  }
  return gatewayMiddleware;
}

async function scrapeUrl(url, format) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'ScrapeAgent/2.0 (MCP)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
  const html = await r.text();

  if (format === 'html') {
    return { url, html: html.slice(0, 50000), length: html.length, scraped_at: new Date().toISOString() };
  }
  if (format === 'links') {
    const links = [];
    const re = /href=["']([^"'#][^"']*?)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      try { links.push(new URL(m[1], url).href); } catch {}
    }
    const unique = [...new Set(links)].slice(0, 500);
    return { url, links: unique, count: unique.length, scraped_at: new Date().toISOString() };
  }
  // Default: clean text
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 10000);
  return { url, text, length: text.length, scraped_at: new Date().toISOString() };
}

async function parseBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function ok(id, result) { return { jsonrpc: '2.0', id: id ?? null, result }; }
function err(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, PAYMENT-SIGNATURE, X-PAYMENT, MCP-Session-Id');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json(err(null, -32600, 'Method not allowed'));

  let body;
  try { body = await parseBody(req); }
  catch { return res.status(400).json(err(null, -32700, 'Parse error')); }

  const { method, id, params } = body;

  // Free methods
  if (method === 'initialize') {
    return res.status(200).json(ok(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'ScrapeAgent', version: '2.0.0' },
    }));
  }
  if (method === 'tools/list') {
    return res.status(200).json(ok(id, { tools: [SCRAPE_TOOL] }));
  }
  if (method === 'notifications/initialized') {
    return res.status(200).json(ok(id, {}));
  }

  // Paid: tools/call
  if (method === 'tools/call') {
    if (params?.name !== 'scrape_url') {
      return res.status(200).json(err(id, -32601, `Unknown tool: ${params?.name}`));
    }

    const paymentHeader = req.headers['payment-signature'] || req.headers['x-payment'];
    if (!paymentHeader) {
      res.setHeader('payment-required', Buffer.from(JSON.stringify({
        x402Version: 2,
        accepts: [{
          scheme: 'GatewayWalletBatched',
          network: 'base-mainnet',
          amount: '10000',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          payTo: WALLET_ADDRESS,
          maxTimeoutSeconds: 300,
        }],
      })).toString('base64'));
      return res.status(402).json(err(id, -32000, 'Payment required: $0.01 USDC via x402'));
    }

    // Verify via Circle Gateway
    try {
      await new Promise((resolve, reject) => {
        const mockRes = {
          status: (code) => ({ json: (b) => { if (code === 402) reject(new Error(b?.error || 'Payment verification failed')); else reject(new Error(`Status ${code}`)); } }),
          setHeader: () => {},
        };
        getGateway()(req, mockRes, resolve);
      });
    } catch (e) {
      return res.status(402).json(err(id, -32000, e.message));
    }

    const { url, format } = params?.arguments ?? {};
    if (!url) return res.status(200).json(err(id, -32602, 'Missing required argument: url'));

    try {
      const result = await scrapeUrl(url, format || 'text');
      return res.status(200).json(ok(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      }));
    } catch (e) {
      return res.status(200).json(err(id, -32000, `Scrape failed: ${e.message}`));
    }
  }

  return res.status(200).json(err(id, -32601, `Method not found: ${method}`));
}
