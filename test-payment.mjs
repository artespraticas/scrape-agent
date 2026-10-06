import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";
import { homedir } from "os";

const wallet = JSON.parse(readFileSync(homedir() + "/.agentcash/wallet.json"));
const account = privateKeyToAccount(wallet.privateKey);

const scheme = new ExactEvmScheme(account);
console.log("Scheme version:", scheme.x402Version);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    { network: "eip155:8453", client: scheme },
  ],
});

console.log("Paying with:", wallet.address);
try {
  const response = await fetchWithPayment("https://api.scrapeagent.xyz/api/scrape/x402", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example.com" })
  });
  console.log("Status:", response.status);
  const text = await response.text();
  console.log("Response:", text.slice(0, 300));
} catch(err) {
  console.error("Error:", err.message);
}
