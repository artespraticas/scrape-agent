// ScrapeAgent MCP Server — Streamable HTTP transport, zero extra deps
// tools/list and initialize are free; tools/call requires x402 payment

const WALLET_ADDRESS = process.env.WALLET_ADDRESS; // set in Vercel env vars
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // arc-studio-allow-onchain-literal

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, MCP-Session-Id, PAYMENT-SIGNATURE, X-PAYMENT');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    if (typeof req.body === 'string') body = JSON.parse(req.body);
    else if (Buffer.isBuffer(req.body)) body = JSON.parse(req.body.toString());
    else body = req.body;
  } catch {
    return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }

  const { id, method, params } = body || {};

  if (method === 'initialize') {
    return res.status(200).json({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'scrapeagent', version: '2.0.0' }
      }
    });
  }

  if (method === 'tools/list') {
    return res.status(200).json({
      jsonrpc: '2.0', id,
      result: {
        tools: [{
          name: 'scrape_url',
          description: 'Scrape a public URL and return its text content. Costs $0.01 USDC per call via x402 payment on Base.',
          inputSchema: {
            type: 'object',
            required: ['url'],
            properties: {
              url: { type: 'string', description: 'Publicly accessible URL to scrape' },
              format: { type: 'string', enum: ['text', 'html', 'links'], description: 'Output format (default: text)' }
            }
          }
        }]
      }
    });
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};

    if (toolName !== 'scrape_url') {
      return res.status(200).json({
        jsonrpc: '2.0', id,
        error: { code: -32601, message: `Unknown tool: ${toolName}` }
      });
    }

    const { url, format = 'text' } = toolArgs;
    if (!url) {
      return res.status(200).json({
        jsonrpc: '2.0', id,
        error: { code: -32602, message: 'url is required' }
      });
    }

    const paymentHeader = req.headers['payment-signature'] || req.headers['x-payment'];
    if (!paymentHeader) {
      return res.status(402).json({
        jsonrpc: '2.0', id,
        error: {
          code: 402,
          message: 'Payment required',
          data: {
            x402Version: 1,
            accepts: [{
              scheme: 'exact',
              network: 'eip155:8453',
              amount: '10000',
              asset: BASE_USDC,
              payTo: WALLET_ADDRESS,
              maxTimeoutSeconds: 300,
              extra: { name: 'USD Coin', version: '2', decimals: 6 }
            }],
            resource: { url: 'https://scrapeagent.xyz/mcp', description: 'ScrapeAgent MCP — scrape_url tool' }
          }
        }
      });
    }

    try {
      const scrapeRes = await fetch('https://scrapeagent.xyz/api/scrape/x402', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PAYMENT-SIGNATURE': paymentHeader
        },
        body: JSON.stringify({ url, format })
      });

      if (!scrapeRes.ok) {
        const err = await scrapeRes.text();
        return res.status(200).json({
          jsonrpc: '2.0', id,
          error: { code: scrapeRes.status, message: err }
        });
      }

      const data = await scrapeRes.json();
      return res.status(200).json({
        jsonrpc: '2.0', id,
        result: {
          content: [{
            type: 'text',
            text: typeof data.text === 'string' ? data.text : JSON.stringify(data)
          }]
        }
      });
    } catch (err) {
      return res.status(200).json({
        jsonrpc: '2.0', id,
        error: { code: -32603, message: `Scrape failed: ${err.message}` }
      });
    }
  }

  return res.status(200).json({
    jsonrpc: '2.0', id,
    error: { code: -32601, message: `Method not found: ${method}` }
  });
}
