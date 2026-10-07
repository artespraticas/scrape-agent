import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";
import { homedir } from "os";

const wallet = JSON.parse(readFileSync(homedir() + "/.agentcash/wallet.json"));
const account = privateKeyToAccount(wallet.privateKey);

const origFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url && url.includes('scrapeagent') && init?.headers) {
    const h = init.headers instanceof Headers ? Object.fromEntries(init.headers) : init.headers;
    const payKey = Object.keys(h).find(k => k.toLowerCase().includes('payment') || k.toLowerCase() === 'x-payment');
    if (payKey) {
      console.log("Payment header name:", payKey);
      const val = h[payKey];
      try {
        const decoded = JSON.parse(Buffer.from(val, 'base64').toString('utf8'));
        console.log("Decoded payment keys:", Object.keys(decoded));
        console.log("Decoded:", JSON.stringify(decoded).slice(0, 300));
      } catch(e) {
        console.log("Raw value:", val.slice(0, 100));
      }
    }
  }
  return origFetch(input, init);
};

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(account) }],
});

try {
  const response = await fetchWithPayment("https://api.scrapeagent.xyz/api/scrape/x402", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example.com" })
  });
  console.log("Status:", response.status);
} catch(err) {
  console.error("Error:", err.message);
}
