import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import handler, { fetchPinned, requireSuccessfulSettlement } from "../api/scrape/x402.js";

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; }
  };
}

test("rejects unsafe URLs before returning a payment challenge", async () => {
  const res = mockResponse();
  await handler({
    method: "GET",
    query: { url: "http://127.0.0.1/" },
    headers: { host: "preview.example" }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Private or reserved/);
  assert.equal(res.headers["payment-required"], undefined);
});

test("missing payment returns matching x402 v2 JSON and header challenge", async () => {
  const res = mockResponse();
  await handler({
    method: "GET",
    query: { url: "https://example.com/" },
    headers: { host: "preview.example" }
  }, res);

  assert.equal(res.statusCode, 402);
  assert.equal(res.body.x402Version, 2);

  const encoded = res.headers["payment-required"];
  assert.ok(encoded, "payment-required header should be present");
  const header = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  assert.equal(header.x402Version, 2);
  assert.deepEqual(
    header.accepts.map(option => option.network),
    ["eip155:8453", "eip155:5042", "eip155:137"]
  );
  assert.ok(header.accepts.every(option => option.amount === "10000"));
  assert.equal(res.headers["access-control-expose-headers"], "payment-required");
});

test("pinned transport connects to the supplied IP without resolving the URL hostname", async t => {
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("pinned connection works");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const address = server.address();
  const response = await fetchPinned(
    new URL(`http://scrapeagent-test.invalid:${address.port}/`),
    "127.0.0.1"
  );

  assert.equal(response.status, 200);
  assert.equal(await new Response(response.body).text(), "pinned connection works");
});

test("malformed payment payload is rejected without a successful scrape response", async () => {
  const res = mockResponse();
  await handler({
    method: "GET",
    query: { url: "https://example.com/" },
    headers: { host: "preview.example", "x-payment": "not-valid-json" }
  }, res);

  assert.equal(res.statusCode, 402);
  assert.match(res.body.error, /^Invalid payment:/);
  assert.equal(res.body.text, undefined);
});

test("payment requirements modified by the client are rejected before facilitator access", async () => {
  const challenge = mockResponse();
  await handler({
    method: "GET",
    query: { url: "https://example.com/" },
    headers: { host: "preview.example" }
  }, challenge);
  assert.equal(challenge.statusCode, 402);

  const accepted = JSON.parse(JSON.stringify(challenge.body.accepts[0]));
  accepted.maxTimeoutSeconds += 1;
  const paymentPayload = {
    x402Version: 2,
    accepted,
    payload: { signature: "0x", authorization: {} }
  };
  const res = mockResponse();
  await handler({
    method: "GET",
    query: { url: "https://example.com/" },
    headers: {
      host: "preview.example",
      "payment-signature": Buffer.from(JSON.stringify(paymentPayload)).toString("base64")
    }
  }, res);

  assert.equal(res.statusCode, 402);
  assert.match(res.body.error, /do not exactly match/);
  assert.equal(res.body.text, undefined);
});

test("a paid success response requires explicit facilitator settlement success", () => {
  assert.throws(() => requireSuccessfulSettlement({}), /not confirmed/);
  assert.throws(() => requireSuccessfulSettlement({ success: false }), /not confirmed/);
  assert.throws(() => requireSuccessfulSettlement({ success: true, error: "settlement error" }), /not confirmed/);
  assert.deepEqual(requireSuccessfulSettlement({ success: true, transaction: "0xabc" }), {
    success: true,
    transaction: "0xabc"
  });
});
