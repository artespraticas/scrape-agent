/**
 * Scrape Agent — x402 pay-per-use scraping endpoint
 *
 * Self-verifies EIP-712 TransferWithAuthorization signatures using viem.
 * Supports Base (eip155:8453), Arc Mainnet (eip155:5042), Polygon (eip155:137).
 */

import express from 'express'
import { recoverTypedDataAddress, getAddress } from 'viem'

const SELLER = (process.env.SELLER_WALLET_ADDRESS ?? '').toLowerCase()

// ── Chain registry ────────────────────────────────────────────────────────────
// arc-studio-allow-onchain-literal
const CHAINS = {
  'eip155:8453': {
    chainId: 8453,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    domain: { name: 'USD Coin', version: '2' },
  },
  'eip155:5042': {
    chainId: 5042,
    usdc: '0x3600000000000000000000000000000000000000',
    domain: { name: 'USD Coin', version: '2' },
  },

  'eip155:137': {
    chainId: 137,
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    domain: { name: 'USD Coin', version: '2' },
  },
}

const PAYMENT_REQUIREMENTS = Object.entries(CHAINS).map(([network, c]) => ({
  scheme: 'exact',
  network,
  amount: '10000',
  maxAmountRequired: '10000',
  maxTimeoutSeconds: 300,
  asset: c.usdc,
  payTo: process.env.SELLER_WALLET_ADDRESS ?? '',
  extra: {
    name: c.domain.name,
    version: c.domain.version,
    assetTransferMethod: 'eip3009',
  },
}))

// ── App ───────────────────────────────────────────────────────────────────────
const app = express()
app.use(express.json())

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, PAYMENT-SIGNATURE')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  next()
})

// ── Payment verification ──────────────────────────────────────────────────────
async function verifyPayment(header) {
  let payload
  try {
    payload = JSON.parse(Buffer.from(header, 'base64').toString('utf8'))
  } catch {
    return { ok: false, error: 'Invalid payment header encoding' }
  }

  const { scheme, network, payload: p } = payload
  const chain = CHAINS[network]
  if (!chain) return { ok: false, error: `Unsupported network: ${network}` }
  if (scheme !== 'exact') return { ok: false, error: `Unsupported scheme: ${scheme}` }

  const { signature, authorization: auth } = p ?? {}
  if (!signature || !auth) return { ok: false, error: 'Missing signature or authorization' }

  try {
    const domain = {
      name: chain.domain.name,
      version: chain.domain.version,
      chainId: chain.chainId,
      verifyingContract: getAddress(chain.usdc),
    }
    const types = {
      TransferWithAuthorization: [
        { name: 'from',        type: 'address' },
        { name: 'to',          type: 'address' },
        { name: 'value',       type: 'uint256' },
        { name: 'validAfter',  type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce',       type: 'bytes32' },
      ],
    }
    const message = {
      from:        getAddress(auth.from),
      to:          getAddress(auth.to),
      value:       BigInt(auth.value),
      validAfter:  BigInt(auth.validAfter),
      validBefore: BigInt(auth.validBefore),
      nonce:       auth.nonce,
    }

    const now = BigInt(Math.floor(Date.now() / 1000))
    if (now < message.validAfter)  return { ok: false, error: 'Payment not yet valid' }
    if (now > message.validBefore) return { ok: false, error: 'Payment expired' }
    if (BigInt(auth.value) < 10000n) return { ok: false, error: 'Insufficient payment amount' }
    if (auth.to.toLowerCase() !== SELLER) return { ok: false, error: 'Wrong payment recipient' }

    const recovered = await recoverTypedDataAddress({ domain, types, primaryType: 'TransferWithAuthorization', message, signature })
    if (recovered.toLowerCase() !== auth.from.toLowerCase()) {
      return { ok: false, error: 'Signature mismatch' }
    }

    return { ok: true, from: auth.from, network, amount: auth.value }
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

// ── HTML helpers ─────────────────────────────────────────────────────────────
function extractContent(html, mode, url) {
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim()

  if (mode === 'html') return { title, content: html.slice(0, 50_000) }

  if (mode === 'links') {
    const links = []
    const re = /href=["']([^"']+)["']/gi
    let m
    while ((m = re.exec(html)) !== null) {
      try { links.push(new URL(m[1], url).href) } catch { /* skip */ }
    }
    return { title, links: [...new Set(links)].slice(0, 200) }
  }

  if (mode === 'meta') {
    const meta = {}
    const re = /<meta\s+(?:[^>]*?\s+)?(?:name|property)=["']([^"']+)["'][^>]*?\s+content=["']([^"']+)["'][^>]*?>/gi
    let m
    while ((m = re.exec(html)) !== null) meta[m[1]] = m[2]
    return { title, meta }
  }

  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20_000)
  return { title, content: clean, wordCount: clean.split(/\s+/).filter(Boolean).length }
}

// ── Route ─────────────────────────────────────────────────────────────────────
app.post('*', async (req, res) => {
  const paymentHeader = req.headers['x-payment'] ?? req.headers['payment-signature']

  if (!paymentHeader) {
    return res.status(402).json({
      x402Version: 2,
      error: 'Payment required',
      resource: {
        url: 'https://scrapeagent.xyz/api/scrape/x402',
        description: 'Pay-per-use web scraping — $0.01 per request',
        mimeType: 'application/json',
      },
      accepts: PAYMENT_REQUIREMENTS,
    })
  }

  const verification = await verifyPayment(paymentHeader)
  if (!verification.ok) {
    return res.status(402).json({
      x402Version: 2,
      error: verification.error,
      resource: {
        url: 'https://scrapeagent.xyz/api/scrape/x402',
        description: 'Pay-per-use web scraping — $0.01 per request',
        mimeType: 'application/json',
      },
      accepts: PAYMENT_REQUIREMENTS,
    })
  }

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
