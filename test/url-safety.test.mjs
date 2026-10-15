import test from "node:test";
import assert from "node:assert/strict";
import { isPublicAddress, validatePublicHttpUrl } from "../lib/url-safety.js";

test("allows public IP addresses", () => {
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("1.1.1.1"), true);
});

test("blocks common private and reserved IPv4 addresses", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "224.0.0.1"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test("blocks local hostnames and unsafe schemes", async () => {
  await assert.rejects(() => validatePublicHttpUrl("file:///etc/passwd"), /Only http/);
  await assert.rejects(() => validatePublicHttpUrl("http://localhost/"), /Local and metadata/);
  await assert.rejects(() => validatePublicHttpUrl("http://127.0.0.1/"), /Private or reserved/);
  await assert.rejects(() => validatePublicHttpUrl("http://user:pass@example.com/"), /credentials/);
});

test("accepts a resolvable public HTTPS hostname", async () => {
  const url = await validatePublicHttpUrl("https://example.com");
  assert.equal(url.hostname, "example.com");
});
