# ScrapeAgent safety preview — validation plan

This branch is a review candidate, not a production release. Do not merge until all required checks pass.

## Scope

- Add URL validation before any payment settlement.
- Reject non-HTTP(S) URLs, embedded credentials, localhost/metadata hostnames, and known private/reserved IP ranges.
- Keep redirects disabled during the first hardening pass; add safe redirect support only with transport-level SSRF protections.
- Verify payment, scrape successfully, and settle only after a successful upstream response.
- Keep the public API response contract consistent with OpenAPI and `llms.txt`.
- Add a separate human-facing preview page with a wallet connection button that only reads the public address. No signing, approvals, network switching, or transfers.
- Keep changes on this branch until reviewed and tested.

## Required automated checks

1. `node --test test/url-safety.test.mjs`
2. `node --check api/scrape/x402.js`
3. `node --check lib/url-safety.js`
4. Confirm public URLs pass validation and local/private/reserved addresses fail.
5. Confirm malformed URLs return 400 before a payment challenge or settlement.
6. Confirm missing payment returns 402 with the intended $0.01 USDC requirements.
7. Confirm invalid payment never calls the scraper or settlement endpoint.
8. Confirm an upstream error does not settle a payment.
9. Confirm a successful scrape returns the documented JSON schema and only then settles.
10. Confirm the human preview page works without a wallet, and with an injected wallet it requests accounts only. No transaction/signature method should be called.

## Important security caveat

The URL validator resolves hostnames and rejects private/reserved results, but standard `fetch` resolves the hostname again. DNS rebinding is therefore not fully eliminated by validation alone. Before claiming production-grade SSRF protection, pin validated DNS addresses at the HTTP transport layer or route outbound fetches through a controlled egress proxy. Treat this as a merge blocker for public, untrusted URL input.

## Manual preview checks

- Visit `/human-preview.html` on a preview deployment.
- Test with no wallet installed.
- Test wallet connect and reject flows.
- Confirm account display and `accountsChanged` handling.
- Confirm there are no signature, approval, or transaction prompts.
- Check the API on a preview deployment only. Do not send real funds until payment verification and settlement are independently tested.

## Release gate

Do not merge or promote to production while any payment-flow, SSRF, schema, or test issue remains open. A passing syntax/test run is not equivalent to a successful paid end-to-end test.
