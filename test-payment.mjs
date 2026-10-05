import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";
import { homedir } from "os";
import { base } from "viem/chains";
import { createWalletClient, http } from "viem";

const wallet = JSON.parse(readFileSync(homedir() + "/.agentcash/wallet.json"));
const account = privateKeyToAccount(wallet.privateKey);
const walletClient = createWalletClient({ account, chain: base, transport: http() });
const client = new x402Client(walletClient);
const x402Fetch = wrapFetchWithPayment(fetch, client);

console.log("Paying with:", wallet.address);
const response = await x402Fetch("https://api.scrapeagent.xyz/api/scrape/x402", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://example.com" })
});
const data = await response.json();
console.log("Success!", JSON.stringify(data, null, 2));
