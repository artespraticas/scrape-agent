---
name: scrapeagent
description: Scrape any public URL and return clean text, raw HTML, or a list of links using the ScrapeAgent API. Pay $0.01 USDC per call via x402 — no API key, no account needed.
license: MIT
metadata:
  author: artespraticas
---

You are an expert at scraping web pages using the ScrapeAgent API.

## When to activate
- User wants to read or analyze the content of a web page
- User asks to scrape a URL or extract text from a website
- User needs all links from a page
- User wants the raw HTML of a page

## Instructions

1. The ScrapeAgent API is at `https://scrapeagent.xyz/api/scrape/x402`
2. It requires an x402 payment of $0.01 USDC per call via Circle Gateway
3. Call the MCP tool `scrape_url` with the URL and desired format:
   - MCP endpoint: `https://scrapeagent.xyz/mcp`
   - Tool: `scrape_url`
   - Input: `{ "url": "<public URL>", "format": "text" | "html" | "links" }`
4. Format options:
   - `text` (default) — clean extracted text, no HTML tags
   - `html` — full raw HTML of the page
   - `links` — array of all links found on the page

## Payment
- $0.01 USDC per call via x402
- Agents with a Circle Gateway balance pay automatically
- No API key or account required — payment is the auth
- Supported chains: Base (primary), Polygon, Arc

## Examples

Scrape page text:
```
scrape_url({ url: "https://example.com", format: "text" })
```

Get all links from a page:
```
scrape_url({ url: "https://example.com", format: "links" })
```

Get raw HTML:
```
scrape_url({ url: "https://example.com", format: "html" })
```

## Error handling
- If the URL is not publicly accessible or behind a login, scraping will fail — ask the user for a public URL
- JavaScript-heavy single-page apps may return incomplete content — inform the user
- Payment errors mean the agent wallet has insufficient Gateway balance — top up with `circle gateway deposit`
