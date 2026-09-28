import express from "express";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { ScrapeSchema, scrapeUrl } from "../lib/scraper.js";

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT, PAYMENT-SIGNATURE, PAYMENT-REQUIRED");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});

// Circle Gateway middleware
const gateway = createGatewayMiddleware({
  sellerAddress: "0x0d4897bf4222deddf8a5b31fa7d8021c369f40d1",
  facilitatorUrl: "https://gateway-api.circle.com",
});

// Discovery endpoint
app.get("/api", (req, res) => {
  res.json({
    name: "Scrape Agent",
    description: "Pay-per-use web scraping API via x402",
    version: "1.0.0",
    endpoint: "POST /api/scrape/x402",
    price: "$0.01 USDC"
  });
});

// Paid scraping endpoint
app.post("/api/scrape/x402", gateway.require("$0.01"), async (req, res) => {
  const parsed = ScrapeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: "Validation failed", issues: parsed.error.flatten() });
  }
  const result = await scrapeUrl(parsed.data);
  res.json({
    protocol: "x402",
    version: 2,
    priceUSD: "0.01",
    settled: true,
    ...result
  });
});

export default app;
