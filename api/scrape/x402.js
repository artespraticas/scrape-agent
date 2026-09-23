/**
 * Scrape Agent — x402 pay-per-use scraping endpoint
 *
 * Uses Circle Gateway Nanopayments (@circle-fin/x402-batching/server) so that
 * every successful payment is reported to the Circle agent marketplace dashboard.
 * Supports Base (eip155:8453), Arc Mainnet (eip155:5042), Arc Testnet (eip155:5042002),
 * Polygon (eip155:137).
 *
 * Runtime: nodejs22.x (set in vercel.json) — required for crypto builtins.
 */

import express from 'express'
import { createGatewayMiddleware } from '@circle-fin/x402-batching/server'

const app = express()
app.use(express.json())

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT, PAYMENT-SIGNATURE')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  next()
})

// ── Circle Gateway payment middleware ─────────────────────────────────────────
// createGatewayMiddleware returns the correct 402 with extra.verifyingContract
// so wallets sign against the GatewayWalletBatched contract (no EOA warnings).
// Verify + settle calls go to gateway-api.circle.com — tracked in Circle dashboard.
const gateway = createGatewayMiddleware({
  sellerAddress: process.env.SELLER_WALLET_ADDRESS ?? '',
  facilitatorUrl: 'https://gateway-api.circle.com',
})

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

  // Default: clean text
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20_000)
  return { title, content: clean, wordCount: clean.split(/\s+/).filter(Boolean).length }
}

// ── Paid route ────────────────────────────────────────────────────────────────
app.post('*', gateway.require('$0.01'), async (req, res) => {
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
