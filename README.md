# ScrapeAgent API — Google Cloud Functions v2

> Pay-per-use web scraping for AI agents.
> Deployed on **Google Cloud Functions v2** — serverless, scales to zero, pay per invocation.
> Accepts $0.01/request in USDC via **MPP** (Stripe/Tempo) or **x402** (Coinbase/Base).

## Architecture

Each endpoint is an independent Cloud Function (HTTP trigger, gen2):

| Function | Entry point | Protocol | Price |
|---|---|---|---|
| `scrape-mpp` | `scrapeMpp` | MPP (Tempo USDC) | $0.01 |
| `scrape-x402` | `scrapeX402` | x402 (Base USDC) | $0.01 |
| `scrape-batch` | `scrapeBatch` | MPP (Tempo USDC) | $0.05 |
| `discovery` | `discovery` | Free | $0.00 |

GCF URLs follow the pattern:
```
https://REGION-PROJECT_ID.cloudfunctions.net/FUNCTION_NAME
```

## Prerequisites

```bash
# 1. Install Google Cloud CLI
# https://cloud.google.com/sdk/docs/install

# 2. Authenticate
gcloud auth login
gcloud auth application-default login

# 3. Set your project
gcloud config set project YOUR_PROJECT_ID

# 4. Enable required APIs (one-time)
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  run.googleapis.com
```

## Deploy in 5 steps

### 1. Clone & install
```bash
git clone https://github.com/YOU/scrape-agent-gcf
cd scrape-agent-gcf
npm install
```

### 2. Create wallets

**MPP wallet (Tempo):**
```bash
npm install -g mppx
npx mppx account create    # creates + auto-funds on testnet
npx mppx account view      # copy this address → WALLET_ADDRESS
```

**x402 wallet (Base):** Use any existing EVM wallet. Fund with USDC on Base.

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env — fill in wallet addresses and generate MPP_SECRET_KEY:
openssl rand -base64 32    # paste this as MPP_SECRET_KEY
```

### 4. Deploy all functions
```bash
chmod +x scripts/*.sh
./scripts/deploy-all.sh
```

This will:
- Build TypeScript → `dist/`
- Deploy all 4 functions to GCF v2
- Print each function's live URL

### 5. Set `SERVICE_BASE_URL` and redeploy discovery
After first deploy, copy the URL prefix and add it to `.env`:
```bash
# Example:
SERVICE_BASE_URL=https://us-central1-myproject.cloudfunctions.net

# Redeploy just the discovery function
bash scripts/deploy.sh discovery
```

## Test your deployment

```bash
# Free — no payment needed
curl https://REGION-PROJECT.cloudfunctions.net/discovery | jq

# Test MPP payment (uses testnet wallet automatically if TEMPO_TESTNET=true)
npx mppx https://REGION-PROJECT.cloudfunctions.net/scrape-mpp \
  --method POST \
  --body '{"url":"https://example.com","extract":"text"}'

# Test from Node.js agent (MPP)
```

## Request & response schema

### Single scrape
**POST** `/scrape-mpp` or `/scrape-x402`
```json
{
  "url": "https://example.com",
  "extract": "text",          // text | html | links | meta | full
  "selector": ".content",     // optional CSS selector
  "timeout": 8000             // optional, ms
}
```

**Response 200:**
```json
{
  "protocol": "mpp",
  "priceUSD": "0.01",
  "url": "https://example.com",
  "status": "ok",
  "title": "Example Domain",
  "content": "This domain is for use...",
  "wordCount": 87,
  "elapsed": 312
}
```

**Response 402 (no/bad payment):**
```json
{
  "x402Version": 1,
  "error": "Payment required",
  "accepts": [{ "scheme": "exact", "network": "base", ... }]
}
```

### Batch scrape
**POST** `/scrape-batch`
```json
{
  "urls": ["https://example.com", "https://other.com"],
  "extract": "text"
}
```

## Cost comparison: GCF vs Vercel

| | GCF v2 | Vercel |
|---|---|---|
| Free tier | 2M invocations/month | 100k/month |
| Beyond free tier | ~$0.40/million | ~$0.65/million |
| Cold start | ~200ms | ~50ms |
| Max timeout | 540s | 10s (hobby) / 300s (pro) |
| Regions | 30+ | 18 |
| Env vars | Via `--set-env-vars` or Secret Manager | Dashboard / CLI |

**GCF is cheaper at volume and has longer timeouts** — better for scraping slow sites.

## Using Google Secret Manager (recommended for production)

Instead of passing secrets as env vars, use Secret Manager:

```bash
# Store secrets
echo -n "0xYOUR_ADDRESS" | gcloud secrets create wallet-address --data-file=-
echo -n "YOUR_SECRET_KEY" | gcloud secrets create mpp-secret-key --data-file=-

# Grant function access
gcloud secrets add-iam-policy-binding wallet-address \
  --member="serviceAccount:PROJECT@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Reference in deploy command
gcloud functions deploy scrape-mpp \
  --set-secrets="WALLET_ADDRESS=wallet-address:latest,MPP_SECRET_KEY=mpp-secret-key:latest" \
  ...
```

## Serve the landing page & llms.txt

GCF doesn't serve static files. Two easy options:

**Option A — Firebase Hosting (free, same Google project):**
```bash
npm install -g firebase-tools
firebase init hosting     # point to public/ directory
firebase deploy --only hosting
```

**Option B — Cloud Storage + CDN:**
```bash
gsutil mb gs://YOUR_BUCKET
gsutil cp public/index.html gs://YOUR_BUCKET/
gsutil cp public/llms.txt gs://YOUR_BUCKET/
gsutil iam ch allUsers:objectViewer gs://YOUR_BUCKET
```

## Project structure

```
scrape-agent-gcf/
├── functions/
│   ├── scrape-mpp/index.ts     # MPP-gated scraper
│   ├── scrape-x402/index.ts    # x402-gated scraper
│   ├── scrape-batch/index.ts   # Batch scraper
│   └── discovery/index.ts      # Free service manifest
├── lib/
│   └── scraper.ts              # Core scraping logic (shared)
├── scripts/
│   ├── deploy-all.sh           # Deploy all 4 functions
│   └── deploy.sh               # Deploy one function
├── public/                     # Static files (deploy to Firebase/GCS)
│   ├── index.html
│   └── llms.txt
├── .env.example
├── package.json
└── tsconfig.json
```

## Make your service discoverable

After deploying, register at:
- **mpp.dev/directory** — MPP service registry
- **x402.org** — Coinbase x402 registry
- Host `llms.txt` and link from your GitHub profile

## License
MIT
