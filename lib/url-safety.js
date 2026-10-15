import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isBlockedIPv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isBlockedIPv6(address) {
  const ip = address.toLowerCase().split("%")[0];
  return (
    ip === "::" || ip === "::1" ||
    ip.startsWith("fc") || ip.startsWith("fd") ||
    /^fe[89ab]/.test(ip) ||
    ip.startsWith("ff") ||
    ip.startsWith("2001:db8:") ||
    ip.startsWith("::ffff:")
  );
}

export function isPublicAddress(address) {
  const version = isIP(address);
  if (version === 4) return !isBlockedIPv4(address);
  if (version === 6) return !isBlockedIPv6(address);
  return false;
}

/**
 * Validates an HTTP(S) URL and rejects obvious local/private destinations.
 * Note: DNS is checked before fetch, but standard fetch resolves DNS separately;
 * production-grade SSRF protection should pin the resolved address at transport level.
 */
export async function validatePublicHttpUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid URL. Provide a complete public http:// or https:// URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http:// and https:// URLs are supported.");
  }
  if (url.username || url.password) {
    throw new Error("URLs containing embedded credentials are not supported.");
  }
  if (!url.hostname || url.hostname.length > 253) {
    throw new Error("Invalid hostname.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal" ||
    hostname === "metadata"
  ) {
    throw new Error("Local and metadata hostnames are not allowed.");
  }

  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new Error("Private or reserved IP addresses are not allowed.");
    return url;
  }

  let records;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Hostname could not be resolved.");
  }
  if (!records.length || records.some(record => !isPublicAddress(record.address))) {
    throw new Error("Hostnames resolving to private or reserved IP addresses are not allowed.");
  }

  return url;
}
