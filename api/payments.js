/**
 * Payments API — returns on-chain USDC transfer history to the seller wallet.
 * Reads Transfer events from Base, Arc, and Polygon USDC contracts.
 * No database needed — ground truth from the chain.
 */

import { createPublicClient, http, parseAbiItem } from 'viem'
import { base, polygon } from 'viem/chains'
import { defineChain } from 'viem'

// arc-studio-allow-onchain-literal
const SELLER = (process.env.SELLER_WALLET_ADDRESS ?? '').toLowerCase()
const PRICE_USDC = 0.01

const arc = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
})

// arc-studio-allow-onchain-literal
const CHAINS = [
  { chain: base,    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', label: 'Base',    color: '#0052FF' },
  { chain: arc,     usdc: '0x3600000000000000000000000000000000000000', label: 'Arc',     color: '#00C2FF' },
  { chain: polygon, usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', label: 'Polygon', color: '#7B3FE4' },
]

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

async function getTransfersForChain({ chain, usdc, label, color }) {
  try {
    const client = createPublicClient({ chain, transport: http() })
    const latest = await client.getBlockNumber()
    // Look back ~7 days (~50400 blocks on Base at ~12s/block; Arc/Polygon similar)
    const fromBlock = latest > 50400n ? latest - 50400n : 0n

    const logs = await client.getLogs({
      address: usdc,
      event: TRANSFER_EVENT,
      args: { to: SELLER },
      fromBlock,
      toBlock: latest,
    })

    return logs.map(log => ({
      chain: label,
      color,
      from: log.args.from,
      amount: Number(log.args.value) / 1e6,
      txHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
    }))
  } catch {
    return []
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')

  if (!SELLER) {
    return res.status(500).json({ error: 'SELLER_WALLET_ADDRESS not configured' })
  }

  const results = await Promise.allSettled(CHAINS.map(getTransfersForChain))

  const payments = results
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .sort((a, b) => b.blockNumber - a.blockNumber)

  const totalUSDC = payments.reduce((sum, p) => sum + p.amount, 0)
  const byChain = {}
  for (const p of payments) {
    if (!byChain[p.chain]) byChain[p.chain] = { count: 0, total: 0, color: p.color }
    byChain[p.chain].count++
    byChain[p.chain].total += p.amount
  }

  return res.json({
    totalUSDC: Math.round(totalUSDC * 100) / 100,
    totalRequests: payments.length,
    pricePerRequest: PRICE_USDC,
    byChain,
    payments: payments.slice(0, 100),
  })
}
