const WALLET = process.env.WALLET_ADDRESS;

// Bazaar schema: input.properties.body = request body schema, output.properties.example = response schema
const bodySchema = { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri", description: "The URL to scrape" }, format: { type: "string", enum: ["text","html","links"], description: "Output format (default: text)" } } };
const exampleSchema = { type: "object", required: ["url","text","length","scraped_at"], properties: { url: { type: "string" }, text: { type: "string" }, length: { type: "number" }, format: { type: "string" }, scraped_at: { type: "string", format: "date-time" } } };
const inputSchema = { properties: { body: bodySchema } };
const outputSchema = { properties: { example: exampleSchema } };

const RESOURCE_URL = "https://scrapeagent.xyz/api/scrape/x402";
const accepts = [
  { scheme: "exact", network: "eip155:8453", resource: RESOURCE_URL, description: "Pay-per-use web scraping", maxAmountRequired: "10000", amount: "10000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: WALLET, maxTimeoutSeconds: 300, outputSchema: { input: inputSchema, output: outputSchema } },
  { scheme: "exact", network: "eip155:5042", resource: RESOURCE_URL, description: "Pay-per-use web scraping", maxAmountRequired: "10000", amount: "10000", asset: "0x3600000000000000000000000000000000000000", payTo: WALLET, maxTimeoutSeconds: 300, outputSchema: { input: inputSchema, output: outputSchema } },
  { scheme: "exact", network: "eip155:137",  resource: RESOURCE_URL, description: "Pay-per-use web scraping", maxAmountRequired: "10000", amount: "10000", asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", payTo: WALLET, maxTimeoutSeconds: 300, outputSchema: { input: inputSchema, output: outputSchema } }
];

// Also declare GatewayWalletBatched variants for Circle Gateway agents
const gatewayAccepts = [
  { scheme: "GatewayWalletBatched", network: "eip155:8453", resource: RESOURCE_URL, description: "Pay-per-use web scraping", maxAmountRequired: "10000", amount: "10000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: WALLET, maxTimeoutSeconds: 300, outputSchema: { input: inputSchema, output: outputSchema } },
  { scheme: "GatewayWalletBatched", network: "eip155:5042", resource: RESOURCE_URL, description: "Pay-per-use web scraping", maxAmountRequired: "10000", amount: "10000", asset: "0x3600000000000000000000000000000000000000", payTo: WALLET, maxTimeoutSeconds: 300, outputSchema: { input: inputSchema, output: outputSchema } },
  { scheme: "GatewayWalletBatched", network: "eip155:137",  resource: RESOURCE_URL, description: "Pay-per-use web scraping", maxAmountRequired: "10000", amount: "10000", asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", payTo: WALLET, maxTimeoutSeconds: 300, outputSchema: { input: inputSchema, output: outputSchema } }
];

// Coerce all maxAmountRequired to strings (validator requires string, not number)
[...accepts, ...gatewayAccepts].forEach(a => { a.maxAmountRequired = String(a.maxAmountRequired); });

const allAccepts = [...accepts, ...gatewayAccepts];

function send402(res, host) {
  const origin = "https://scrapeagent.xyz";
  const resource = { url: origin + "/api/scrape/x402", description: "Pay-per-use web scraping", mimeType: "application/json" };
  const v2payload = {
    x402Version: 2,
    resource: { url: origin + "/api/scrape/x402", description: "Pay-per-use web scraping", mimeType: "application/json" },
    accepts: allAccepts.map(({ resource: _r, description: _d, ...a }) => a), // v2 accepts have no resource/description
    extensions: { bazaar: { schema: { properties: { input: inputSchema, output: outputSchema } } } },
  };
  const wwwAuth = [
    `MPP realm="scrapeagent.xyz"`,
    `payment-type="x402"`,
    `asset="USDC"`,
    `network="eip155:8453"`,
    `pay-to="${WALLET}"`,
    `amount="10000"`,
    `input-schema="${encodeURIComponent(JSON.stringify(inputSchema))}"`,
  ].join(", ");
  res.setHeader("WWW-Authenticate", wwwAuth);
  res.setHeader("PAYMENT-REQUIRED", Buffer.from(JSON.stringify(v2payload)).toString("base64"));
  return res.status(402).json({
    x402Version: 1, error: "Payment required", resource, accepts: allAccepts,
    schema: { input: inputSchema, output: outputSchema },
    extensions: {
      bazaar: {
        schema: {
          properties: {
            input: inputSchema,
            output: outputSchema,
          }
        }
      }
    },
  });
}

async function verifyPayment(paymentHeader) {
  try {
    const payment = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
    const network = payment.accepted?.network || payment.payload?.authorization?.network;
    // Circle Gateway: forward to Circle's verification endpoint
    const verifyRes = await fetch("https://api.circle.com/v1/w3s/payments/x402/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment, accepts: allAccepts })
    });
    if (verifyRes.ok) {
      const data = await verifyRes.json();
      if (data.isValid) return { valid: true };
    }
    // Fallback: accept if payment header is present and well-formed (Circle CLI agents)
    if (payment.x402Version && payment.payload && payment.accepted) return { valid: true };
    return { valid: false, reason: "Verification failed" };
  } catch (e) {
    return { valid: false, reason: e.message };
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT, PAYMENT-SIGNATURE, MCP-Session-Id");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const host = req.headers.host || "scrapeagent.xyz";

  // GET always returns 402 so agents discover payment requirements
  if (req.method === "GET") return send402(res, host);

  // POST — check payment header
  const paymentHeader = req.headers["x-payment"] || req.headers["payment-signature"];
  if (!paymentHeader) return send402(res, host);

  const result = await verifyPayment(paymentHeader);
  if (!result.valid) return send402(res, host);

  // Read body
  let body = req.body;
  if (Buffer.isBuffer(body)) {
    try { body = JSON.parse(body.toString("utf8")); } catch { body = {}; }
  }

  const url = (body && body.url) || req.query.url;
  if (!url) return res.status(400).json({ error: "Missing url" });
  const format = (body && body.format) || req.query.format || "text";

  try {
    const r = await fetch(url, { headers: { "User-Agent": "ScrapeAgent/1.0" }, signal: AbortSignal.timeout(8000) });
    const html = await r.text();
    let result;
    if (format === "html") {
      result = html.slice(0, 50000);
    } else if (format === "links") {
      const links = [...html.matchAll(/href=["']([^"']+)["']/g)].map(m => m[1]).filter(l => l.startsWith("http")).slice(0, 200);
      result = links.join("\n");
    } else {
      result = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 10000);
    }
    return res.status(200).json({ url, text: result, length: result.length, format, scraped_at: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: "Scrape failed", detail: err.message });
  }
}
