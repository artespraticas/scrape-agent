import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";
import { homedir } from "os";

const wallet = JSON.parse(readFileSync(homedir() + "/.agentcash/wallet.json"));
const account = privateKeyToAccount(wallet.privateKey);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    { network: "eip155:8453", client: new ExactEvmScheme(account) },
    { network: "eip155:137", client: new ExactEvmScheme(account) },
  ],
});

console.log("Paying with:", wallet.address);
const response = await fetchWithPayment("https://api.scrapeagent.xyz/api/scrape/x402", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://example.com" })
});
const data = await response.json();
console.log("Success!", JSON.stringify(data, null, 2));
