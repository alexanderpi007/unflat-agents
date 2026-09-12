import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { createInterface } from "node:readline/promises";
import { formatUnits, getAddress, isAddress } from "viem";
import { RefusalError } from "../src/core/errors";
import { aimorganFeeWaivedLabel, directMorphoLabel } from "../src/core/labels";
import type { HexAddress, RuntimeHealth, X402QuoteConfirmation } from "../src/core/types";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const { createApplicationRuntime } = await import("../src/server/runtime");

const persistentAgentId = "a7100000-0000-4000-8000-000000000001";
const transferUsdcCents = 5;
const depositUsdcCents = 100;
const strategyTotalUsdcCents = 100;
const baseScan = (hash: string) => `https://basescan.org/tx/${hash}`;
const money = (cents: number) => `$${(cents / 100).toFixed(2)} USDC`;
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function modes(health: RuntimeHealth) {
  const labels = { privy: "Privy", aiMorgan: "AIMorgan", arkiv: "Arkiv", swarm: "Swarm", ens: "ENS" } as const;
  const entries = Object.entries(health.adapters) as Array<
    [keyof typeof labels, RuntimeHealth["adapters"][keyof RuntimeHealth["adapters"]]]
  >;
  const live = entries.filter(([, status]) => status.mode === "live").map(([key]) => labels[key]);
  const mock = entries.filter(([, status]) => status.mode === "mock").map(([key]) => labels[key]);
  return { entries, labels, live, mock };
}

async function waitForMandateExpiry(expiresAt: string) {
  while (Date.now() < new Date(expiresAt).getTime()) {
    const remaining = new Date(expiresAt).getTime() - Date.now();
    console.log(`- Mandate expiry in ${Math.ceil(remaining / 1_000)}s…`);
    await delay(Math.min(30_000, remaining + 50));
  }
}

async function main() {
  const configuredRecipient = process.env.DEMO_PAYMENT_RECIPIENT?.trim();
  if (!configuredRecipient || !isAddress(configuredRecipient)) {
    throw new Error(
      "DEMO_PAYMENT_RECIPIENT must be set to the exact Base address that will receive the 0.05 USDC proof payment.",
    );
  }
  const recipient = getAddress(configuredRecipient) as HexAddress;
  const runtime = createApplicationRuntime();
  const adapterModes = modes(runtime.health);
  if (runtime.health.adapters.privy.mode !== "live" || runtime.health.adapters.aiMorgan.mode !== "live") {
    throw new Error("npm run demo requires LIVE Privy and AIMorgan adapters. Use npm run demo:mock for the safety-net run.");
  }

  console.log("\nunflat × agents — LIVE Base mainnet demo\n");
  console.log("Adapter modes");
  for (const [key, status] of adapterModes.entries) {
    console.log(`- ${adapterModes.labels[key]}: ${status.mode.toUpperCase()} — ${status.detail}`);
  }

  const { agent, reused } = await runtime.gateway.getOrCreateAgent(persistentAgentId, "Atlas");
  const vault = await runtime.gateway.vaultRate();
  console.log("\nPersistent agent wallet");
  console.log(`- Status: ${reused ? "REUSED from gateway store" : "CREATED once and persisted in gateway store"}`);
  console.log(`- Address to fund on Base: ${agent.walletAddress}`);
  console.log(`- Privy wallet ID: ${agent.walletId}`);
  console.log(`- Vault: ${vault.vault.label} (${vault.vault.address})`);
  console.log(`- Vault APY: ${vault.apyBasisPoints == null ? "unavailable" : `${(vault.apyBasisPoints / 100).toFixed(2)}%`} (${vault.source}; ${vault.detail})`);

  const preview = await runtime.gateway.previewStrategize({
    agentId: agent.id,
    totalUsdcCents: strategyTotalUsdcCents,
  });
  const confirmation: X402QuoteConfirmation | undefined = preview.mode === "x402"
    ? {
        resource: preview.quote.resource,
        payTo: preview.quote.payTo,
        asset: preview.quote.asset,
        network: preview.quote.network,
        amountAtomic: preview.quote.amountAtomic,
        amountUsdcCents: preview.quote.amountUsdcCents,
        method: preview.quote.method,
      }
    : undefined;
  const aimorganFeeUsdcCents = preview.mode === "x402" ? preview.quote.amountUsdcCents : 0;
  const requiredUsdcCents = transferUsdcCents + aimorganFeeUsdcCents + depositUsdcCents;
  const balance = await runtime.gateway.usdcBalance(agent.id);
  const depositPreview = await runtime.gateway.previewVaultDeposit({
    agentId: agent.id,
    amountUsdcCents: depositUsdcCents,
  });

  console.log("\nEXACT ACTIONS REQUIRING CONFIRMATION");
  console.log(`1. Base USDC transfer via Privy: ${money(transferUsdcCents)}`);
  console.log(`   From agent: ${agent.walletAddress}`);
  console.log(`   Recipient: ${recipient}`);
  console.log("   Asset: canonical Base USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  if (preview.mode === "x402") {
    console.log(`2. AIMorgan strategize: dry:true, then x402 payment of ${money(preview.quote.amountUsdcCents)}`);
    console.log(`   POST ${preview.quote.resource}`);
    console.log(`   x402 recipient: ${preview.quote.payTo}`);
    console.log(`   x402 asset: Base USDC ${preview.quote.asset}`);
  } else {
    console.log("2. AIMorgan strategize: dry:true, then ?free=true; no transaction and no AIMorgan fee");
    console.log(`   ${aimorganFeeWaivedLabel}`);
  }
  console.log(`3. ${vault.vault.execution === "direct-morpho" ? directMorphoLabel : "Privy Earn API deposit"}: ${money(depositUsdcCents)}`);
  console.log(`   Allowlisted vault: ${vault.vault.label}`);
  console.log(`   Vault address: ${vault.vault.address}`);
  if (vault.vault.execution === "direct-morpho") {
    if (depositPreview.approvalRequired) {
      console.log("   Privy eth_sendTransaction #1: approve exactly 1.00 USDC to this vault.");
    } else {
      console.log(`   Existing exact approval will be reused; no approval signing call: ${depositPreview.preflight.approvalTransactionHash}`);
      console.log(`   BaseScan: ${baseScan(depositPreview.preflight.approvalTransactionHash!)}`);
    }
    console.log("   Then: eth_call deposit simulation using the confirmed allowance.");
    console.log(`   Privy eth_sendTransaction: deposit 1.00 USDC with receiver ${agent.walletAddress}.`);
  } else {
    console.log("   Privy Earn may broadcast approval and deposit transaction(s).");
  }
  console.log(`Total Base USDC required: ${money(requiredUsdcCents)}`);
  console.log(`Current wallet balance: ${formatUnits(BigInt(balance.rawAmount), 6)} USDC`);
  console.log("No signing call or transaction submission has happened.");

  if (!depositPreview.preflight.allPassed) {
    console.log(`\nPREFLIGHT FAILED — ${depositPreview.preflight.reason}`);
    return;
  }

  if (BigInt(balance.rawAmount) < BigInt(requiredUsdcCents) * 10_000n) {
    console.log(`\nNOT FUNDED — send at least ${money(requiredUsdcCents)} on Base to ${agent.walletAddress}, then run npm run demo again.`);
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("\nABORTED — live execution requires an interactive terminal confirmation.");
    return;
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question('\nType exactly "CONFIRM BASE MAINNET" to execute these actions: ');
  prompt.close();
  if (answer !== "CONFIRM BASE MAINNET") {
    console.log("ABORTED — confirmation did not match. No signing call was made.");
    return;
  }

  console.log("\nConfirmation accepted. Creating the 2-minute mandate and revalidating immediately before each signing call…");
  const mandate = await runtime.gateway.grantMandate({
    agentId: agent.id,
    ownerId: "owner:live-demo",
    durationSeconds: 120,
    maxPerActionUsdcCents: depositUsdcCents,
    maxTotalUsdcCents: 120,
  });

  const transfer = await runtime.gateway.transferUsdc({
    agentId: agent.id,
    recipient,
    amountUsdcCents: transferUsdcCents,
    idempotencyKey: `live-transfer-${randomUUID()}`,
  });
  console.log(`\nUSDC transfer transaction: ${transfer.transfer.transactionHash}`);
  console.log(`BaseScan: ${baseScan(transfer.transfer.transactionHash)}`);

  const strategy = await runtime.gateway.strategize({
    agentId: agent.id,
    totalUsdcCents: strategyTotalUsdcCents,
    idempotencyKey: `live-strategy-${randomUUID()}`,
    confirmedQuote: confirmation,
  });
  if (preview.mode === "x402") {
    if (!strategy.x402Settlement) throw new Error("Paid AIMorgan strategy did not include a verified Base x402 receipt.");
    console.log(`\nx402 transaction: ${strategy.x402Settlement.transactionHash}`);
    console.log(`BaseScan: ${baseScan(strategy.x402Settlement.transactionHash)}`);
  } else {
    if (strategy.aimorganFeeMode !== "waived") throw new Error("AIMorgan did not confirm the fee-waived strategy mode.");
    console.log(`\n${aimorganFeeWaivedLabel}`);
  }

  const sweep = await runtime.gateway.sweepIdle({
    agentId: agent.id,
    strategyId: strategy.id,
    amountUsdcCents: depositUsdcCents,
    idempotencyKey: `live-earn-${randomUUID()}`,
  });
  if (sweep.deposit.mode === "direct-morpho") {
    console.log(`\n${directMorphoLabel}`);
    console.log(`USDC approval: ${sweep.deposit.approval.transactionHash}`);
    console.log(`BaseScan: ${sweep.deposit.approval.explorerUrl}`);
    console.log(`Morpho deposit: ${sweep.deposit.deposit.transactionHash}`);
    console.log(`BaseScan: ${sweep.deposit.deposit.explorerUrl}`);
    console.log(`Vault shares received: ${sweep.deposit.sharesReceived} (${sweep.deposit.sharesReceivedRaw} raw, ${sweep.deposit.shareDecimals} decimals)`);
  } else {
    console.log(`\nPrivy Earn action: ${sweep.deposit.actionId} (${sweep.deposit.status})`);
    for (const hash of sweep.deposit.transactionHashes) {
      console.log(`Earn transaction: ${hash}`);
      console.log(`BaseScan: ${baseScan(hash)}`);
    }
  }

  console.log(`\nMandate expires at ${mandate.expiresAt}; waiting to prove the final refusal.`);
  await waitForMandateExpiry(mandate.expiresAt);
  try {
    await runtime.gateway.transferUsdc({
      agentId: agent.id,
      recipient,
      amountUsdcCents: transferUsdcCents,
      idempotencyKey: `live-expired-${randomUUID()}`,
    });
    throw new Error("Expired mandate unexpectedly accepted an action.");
  } catch (error) {
    if (!(error instanceof RefusalError)) throw error;
    console.log(error.message);
  }

  console.log("Statement ready — open the dashboard, connect Swarm ID, and click Publish statement. The secret reference stays with the owner.");
  console.log("Swarm: OWNER BROWSER — publication pending.");
  console.log(`Demo footer — LIVE: ${adapterModes.live.join(", ") || "none"} · MOCK: ${adapterModes.mock.join(", ") || "none"}\n`);
}

main().catch((error) => {
  console.error(`\nLIVE DEMO FAILED: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
});
