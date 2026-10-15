# ScrapeAgent safety preview — validation plan

This branch and its draft pull request are review candidates, not a production release. Do not merge or promote until all required checks pass and the owner explicitly approves.

## Scope

- Validate HTTP(S) URLs before returning payment terms or attempting any paid work.
- Reject embedded credentials, local/metadata hostnames, and private/reserved IP ranges.
- Resolve DNS once, validate the answers, and pin the selected validated IP in the outbound Node HTTP(S) request. Preserve the original hostname for the HTTP Host header and TLS certificate/SNI checks.
- Reject redirects so a redirect cannot bypass URL validation.
- Verify a payment against server-owned x402 v2 requirements; do not forward client-controlled payment requirements to the facilitator.
- Extract supported HTML/plain-text content with an upstream response size cap and text length cap.
- Return a paid success response only when the facilitator explicitly reports settlement success.
- Keep the human-facing wallet preview read-only: account access only, no signatures, approvals, network switching, or transactions.
- Keep all changes on the preview branch until reviewed and tested.

## Automated checks

GitHub Actions runs these commands on pushes to this branch and pull requests targeting `main`:

1. `npm run check` — syntax-check the API handler and URL safety module.
2. `npm test` — test URL validation, x402 challenge consistency, unsafe URL rejection, pinned transport, malformed/modified payment rejection, and explicit settlement-success handling.

A successful CI run confirms these automated checks passed for that exact commit. It does not prove the live facilitator can verify and settle a real payment.

## Required manual / integration checks

1. Confirm malformed and unsafe URLs are rejected before a payment challenge or settlement.
2. Confirm missing payment returns HTTP 402 with matching x402 v2 JSON/header and the intended $0.01 USDC requirements.
3. Confirm malformed or altered payment terms are rejected before the facilitator is called.
4. Confirm a facilitator verification failure never triggers scraping or settlement.
5. Confirm upstream HTTP errors, redirects, unsupported content types, timeouts, and oversized bodies never produce a successful paid response.
6. Confirm settlement errors or responses without `success: true` never produce a successful paid response.
7. Confirm successful extraction returns the documented schema only after settlement success.
8. Confirm the human preview page works without a wallet and, with an injected wallet, requests accounts only.

## Remaining release blockers

- The pinned transport is implemented and has an isolated local-server test, but the full automated suite must pass on the latest branch head before relying on it.
- No successful paid end-to-end test has been performed. Do not use real funds until the owner explicitly approves a controlled test.
- The live Coinbase CDP facilitator verification/settlement flow still needs a deliberate end-to-end validation; mocked/isolated tests cannot establish that credentials, supported networks, payloads, and facilitator responses are configured correctly.
- Inspect all CI results and the final preview deployment before merge.
- Do not merge or deploy to production until the release blockers are resolved and the owner explicitly approves.

## Manual preview checks

- Visit `/playground.html` and inspect the expected unpaid HTTP 402 challenge.
- Visit `/human-preview.html` on a preview deployment.
- Test with no wallet installed.
- Test wallet connect and reject flows.
- Confirm account display and `accountsChanged` handling.
- Confirm there are no signature, approval, or transaction prompts.

## Release gate

A successful build or passing syntax/test run is not equivalent to a successful paid end-to-end test. Keep production untouched until security, payment-flow, schema, and runtime checks are complete.
