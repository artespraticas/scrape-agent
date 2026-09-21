import express from "express";
import { x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { BatchFacilitatorClient, GatewayEvmScheme } from "@circle-fin/x402-batching/server";

const app = express();
app.use(express.json());

// Circle Gateway middleware (Base + Polygon)
const server = new x402ResourceServer([
  new HTTPFacilitatorClient({ url: "https://facilitator.x402.org" }),
  new BatchFacilitatorClient({
    facilitatorUrl: "https://gateway-api.circle.com",
    sellerAddress: process.env.SELLER_WALLET_ADDRESS,
  }),
]);
server.register("eip155:*", new GatewayEvmScheme());
await server.initialize();

const paymentMiddleware = server.middleware({
  "POST /api/scrape/x402": {
    accepts: [
      { scheme: "exact", price: "$0.01", network: "eip155:8453", payTo: process.env.SELLER_WALLET_ADDRESS },
      { scheme: "exact", price: "$0.01", network: "eip155:137", payTo: process.env.SELLER_WALLET_ADDRESS }
    ],
    description: "Pay-per-use web scraping. Extract text, links, HTML or metadata from any public URL. No API key or account needed.",
    mimeType: "application/json",
  },
});

app.use(paymentMiddleware);

app.post("/api/scrape/x402", async (req, res) => {
  const { url, extract = "text" } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "ScrapeAgent/1.0 (+https://scrapeagent.xyz)" },
    });
    const html = await response.text();

    let result;
    if (extract === "text") {
      result = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    } else if (extract === "html") {
      result = html;
    } else if (extract === "links") {
      const matches = [...html.matchAll(/href=["']([^"']+)["']/g)];
      result = matches.map((m) => m[1]);
    } else if (extract === "meta") {
      const title = html.match(/<title>([^<]*)<\/title>/)?.[1] || "";
      const desc = html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
      result = { title, description: desc, url };
    } else {
      result = html;
    }

    return res.json({ url, extract, result, statusCode: response.status });
  } catch (err) {
    return res.status(500).json({ error: "Scrape failed", detail: err.message });
  }
});

app.get("/", (req, res) => {
  res.json({
    name: "Scrape Agent",
    description: "Pay-per-use web scraping API built on x402",
    version: "2.0.0",
    endpoint: "/api/scrape/x402",
    price: "$0.01 USDC",
    networks: ["Base", "Polygon"],
    docs: "https://scrapeagent.xyz/openapi.json",
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Scrape Agent running on port", process.env.PORT || 3000);
});
