import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/scrape/x402.js";

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
