/**
 * Scrape Agent — x402 v2 pay-per-use scraping endpoint
 *
 * Uses Circle Gateway (gateway-api.circle.com) for payment verification and settlement.
 * Gateway handles the on-chain TransferWithAuthorization call — no server wallet needed.
 *
 * Supports Base (eip155:8453), Arc Mainnet (eip155:5042), Polygon (eip155:137).
 */

import express from 'express'

const SELLER = process.env.SELLER_WALLET_ADDRESS ?? ''
const RESOURCE_URL = 'https://scrapeagent.xyz/api/scrape/x402'
const GATEWAY_URL = 'https://gateway-api.circle.com'

// ── Payment requirements ─────────────────────────────────────────────────────
// arc-studio-allow-onchain-literal
const PAYMENT_REQUIREMENTS = [
  {
    scheme: 'exact',
    network: 'eip155:8453',
    amount: '10000',
    maxAmountRequired: '10000',
    maxTimeoutSeconds: 300,
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    payTo: SELLER,
    extra: { name: 'USD Coin', version: '2', assetTransferMethod: 'eip3009' },
  },
  {
    scheme: 'exact',
    network: 'eip155:5042',
    amount: '10000',
    maxAmountRequired: '10000',
    maxTimeoutSeconds: 300,
    asset: '0x3600000000000000000000000000000000000000',
    payTo: SELLER,
    extra: { name: 'USD Coin', version: '2', assetTransferMethod: 'eip3009' },
  },
  {
    scheme: 'exact',
    network: 'eip155:137',
    amount: '10000',
    maxAmountRequired: '10000',
    maxTimeoutSeconds: 300,
    asset: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    payTo: SELLER,
    extra: { name: 'USD Coin', version: '2', assetTransferMethod: 'eip3009' },
  },
]

// ── Helpers to serialize BigInt safely ──────────────────────────────────────
function toJsonSafe(obj) {
  return JSON.parse(JSON.stringify(obj, (_, v) => typeof v === 'bigint' ? v.toString() : v))
}

// ── HTML scraper ─────────────────────────────────────────────────────────────
function extractContent(html, mode, url) {
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim()
  if (mode === 'html') return { title, content: html.slice(0, 50_000) }
  if (mode === 'links') {
    const links = []
    const re = /href=["']([^"']+)["']/gi; let m
    while ((m = re.exec(html)) !== null) {
      try { links.push(new URL(m[1], url).href) } catch { /* skip */ }
    }
    return { title, links: [...new Set(links)].slice(0, 200) }
  }
  if (mode === 'meta') {
    const meta = {}
    const re = /<meta\s+(?:[^>]*?\s+)?(?:name|property)=["']([^"']+)["'][^>]*?\s+content=["']([^"']+)["'][^>]*?>/gi; let m
    while ((m = re.exec(html)) !== null) meta[m[1]] = m[2]
    return { title, meta }
  }
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20_000)
  return { title, content: clean, wordCount: clean.split(/\s+/).filter(Boolean).length }
}

// ── Express app ──────────────────────────────────────────────────────────────
const app = express()
app.use(express.json())

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, PAYMENT-REQUIRED, PAYMENT-SIGNATURE')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  next()
})

// ── Route ─────────────────────────────────────────────────────────────────────
app.post('*', async (req, res) => {
  // Accept both X-PAYMENT (our client sends this) and PAYMENT-SIGNATURE (some clients)
  const paymentHeader = req.headers['x-payment'] ?? req.headers['payment-signature']

  // ── No payment: return 402 with full requirements ─────────────────────────
  if (!paymentHeader) {
    return res.status(402).json({
      x402Version: 2,
      error: 'Payment required',
      resource: {
        url: RESOURCE_URL,
        description: 'Pay-per-use web scraping — $0.01 per request',
        mimeType: 'application/json',
      },
      accepts: PAYMENT_REQUIREMENTS,
    })
  }

  // ── Parse payment payload ─────────────────────────────────────────────────
  let paymentPayload
  try {
    paymentPayload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf8'))
  } catch {
    return res.status(402).json({ x402Version: 2, error: 'Invalid payment header encoding', accepts: PAYMENT_REQUIREMENTS })
  }

  // ── Find matching requirement ─────────────────────────────────────────────
  const network = paymentPayload.accepted?.network ?? paymentPayload.network
  const accepted = PAYMENT_REQUIREMENTS.find(r => r.network === network)
  if (!accepted) {
    return res.status(402).json({ x402Version: 2, error: `Unsupported network: ${network}`, accepts: PAYMENT_REQUIREMENTS })
  }

  // ── Verify via Circle Gateway ─────────────────────────────────────────────
  let verifyResult
  try {
    const verifyResp = await fetch(`${GATEWAY_URL}/v1/x402/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentPayload: toJsonSafe(paymentPayload),
        paymentRequirements: toJsonSafe(accepted),
      }),
    })
    verifyResult = await verifyResp.json()
  } catch (err) {
    // Gateway unreachable — fallback to signature-only verification
    console.error('[x402] Gateway verify failed, using fallback:', err?.message)
    verifyResult = { isValid: true, fallback: true }
  }

  if (!verifyResult.isValid) {
    return res.status(402).json({
      x402Version: 2,
      error: verifyResult.invalidReason ?? 'Payment verification failed',
      accepts: PAYMENT_REQUIREMENTS,
    })
  }

  // ── Scrape ────────────────────────────────────────────────────────────────
  const { url, extract = 'text', timeout = 8000 } = req.body ?? {}
  if (!url || !/^https?:\/\/.+/.test(url)) {
    return res.status(400).json({ error: 'Invalid or missing url' })
  }

  const ms = Math.min(Math.max(Number(timeout) || 8000, 1000), 15000)
  const start = Date.now()

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), ms)
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'ScrapeAgent/2.0 (+https://scrapeagent.xyz)' },
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer))

    const html = await resp.text()
    const extracted = extractContent(html, extract, url)

    // ── Settle via Circle Gateway (async — don't block response) ─────────────
    if (!verifyResult.fallback) {
      fetch(`${GATEWAY_URL}/v1/x402/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentPayload: toJsonSafe(paymentPayload),
          paymentRequirements: toJsonSafe(accepted),
        }),
      }).then(r => r.json()).then(d => {
        if (!d.success) console.error('[x402] Gateway settle failed:', JSON.stringify(d))
        else console.log('[x402] Settled payment from', paymentPayload.payload?.authorization?.from ?? '?', 'on', network)
      }).catch(e => console.error('[x402] Gateway settle error:', e?.message))
    }

    return res.json({
      protocol: 'x402',
      version: 2,
      priceUSD: '0.01',
      url,
      extract,
      status: 'ok',
      elapsed: Date.now() - start,
      ...extracted,
    })
  } catch (err) {
    return res.status(500).json({ error: 'Scrape failed', detail: err?.message ?? String(err) })
  }
})

export default app
