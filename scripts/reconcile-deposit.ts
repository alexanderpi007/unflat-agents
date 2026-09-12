import { loadEnvFile } from "node:process";
import { createPublicClient, decodeEventLog, erc20Abi, erc4626Abi, http } from "viem";
import { base } from "viem/chains";
import { FileGatewayStore } from "../src/core/file-store";
import { confirmedShares } from "../src/adapters/live/confirmed-shares";

// Read-only chain access: this recovery cannot instantiate a signer or resend a deposit.
loadEnvFile();
const hash = "0xd16a7ee70eacd0b22e260bf841c41a0016027d42b58efdb9fc8a6636604a8b0a";
const vault = "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9";
const agentId = "a7100000-0000-4000-8000-000000000001";
const store = new FileGatewayStore(process.env.GATEWAY_STORE_PATH || ".data/gateway.json");
const agent = await store.getAgent(agentId);
if (!agent) throw new Error("Persistent agent missing; cannot reconcile.");
const allowlist = JSON.parse(process.env.UNFLAT_VAULT_ALLOWLIST || "[]") as { address: string }[];
if (!allowlist.some((entry) => entry.address.toLowerCase() === vault.toLowerCase())) {
  throw new Error("Receipt vault is not allowlisted.");
}
const client = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL, { retryCount: 3, retryDelay: 1000 }) });
if (await client.getChainId() !== 8453) throw new Error("RPC must be Base mainnet.");
const receipt = await client.getTransactionReceipt({ hash });
if (receipt.status !== "success" || receipt.to?.toLowerCase() !== vault.toLowerCase()
  || receipt.from.toLowerCase() !== agent.walletAddress.toLowerCase() || receipt.blockNumber !== 51217477n) {
  throw new Error("Receipt does not match the confirmed recovery deposit.");
}
let raw: bigint | undefined;
for (const log of receipt.logs) {
  if (log.address.toLowerCase() !== vault.toLowerCase()) continue;
  try {
    const event = decodeEventLog({ abi: erc4626Abi, data: log.data, topics: log.topics });
    if (event.eventName === "Deposit" && event.args.assets === 1_000_000n
      && event.args.sender.toLowerCase() === agent.walletAddress.toLowerCase()
      && event.args.receiver.toLowerCase() === agent.walletAddress.toLowerCase()) raw = event.args.shares;
  } catch { /* Other vault events are not deposit evidence. */ }
}
if (!raw || raw <= 0n) throw new Error("Expected 1 USDC Deposit event missing.");
const shares = await confirmedShares(raw, () => client.readContract({ address: vault, abi: erc20Abi, functionName: "decimals" }));
const block = await client.getBlock({ blockNumber: receipt.blockNumber });
const existing = (await store.listEvents(agentId)).some((event) => event.action === "earn.sweep" && event.status === "completed" && event.reference === hash);
await store.appendEvent({
  id: `reconciled:base:${hash}`, agentId, action: "earn.sweep", status: "completed", amountUsdcCents: 100,
  at: new Date(Number(block.timestamp) * 1000).toISOString(), reference: hash,
  reason: `RECONCILED — Direct Morpho deposit (Privy Earn pending activation). Confirmed 1.00 USDC deposit into allowlisted Steakhouse Prime USDC at Base block ${receipt.blockNumber}. Received ${shares.sharesReceivedRaw} raw vault shares; formatted shares: ${shares.sharesReceived}; decimals: ${shares.shareDecimals ?? "unavailable"}. Recovered from the successful receipt after an optional RPC lookup failed. No new transaction or budget charge. https://basescan.org/tx/${hash}`,
});
console.log(JSON.stringify({ result: existing ? "Already reconciled; no duplicate" : "Completion event reconciled", hash, block: receipt.blockNumber.toString(), ...shares, newTransactions: 0 }, null, 2));
