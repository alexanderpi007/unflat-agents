import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { createInterface } from "node:readline/promises";
import { formatUnits } from "viem";
import { aimorganFeeWaivedLabel, directMorphoLabel } from "../src/core/labels";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const { createApplicationRuntime } = await import("../src/server/runtime");

const persistentAgentId = "a7100000-0000-4000-8000-000000000001";
const depositUsdcCents = 100;
const baseScan = (hash: string) => `https://basescan.org/tx/${hash}`;

async function main() {
  const runtime = createApplicationRuntime();
  if (runtime.health.adapters.privy.mode !== "live") {
    throw new Error("Privy must be LIVE for the Earn retry.");
  }
  if (process.env.AIMORGAN_X402 === "true") {
    throw new Error("Set AIMORGAN_X402=false so this retry cannot create an AIMorgan payment.");
  }

  const { agent } = await runtime.gateway.getOrCreateAgent(persistentAgentId, "Atlas");
  const vault = await runtime.gateway.vaultRate();
  const balance = await runtime.gateway.usdcBalance(agent.id);
  const depositPreview = await runtime.gateway.previewVaultDeposit({
    agentId: agent.id,
    amountUsdcCents: depositUsdcCents,
  });
  const preview = await runtime.gateway.previewStrategize({
    agentId: agent.id,
    totalUsdcCents: depositUsdcCents,
  });
  if (preview.mode !== "waived") throw new Error("AIMorgan fee-waived mode is not active.");

  console.log("\nunflat × agents — LIVE vault deposit retry\n");
  console.log("EXACT ACTIONS REQUIRING CONFIRMATION");
  console.log("1. Grant a new 2-minute mandate limited to AIMorgan strategize and the vault deposit.");
  console.log("   Per-action cap: $1.00 USDC · total cap: $1.00 USDC");
  console.log("2. AIMorgan strategize: dry:true, then ?free=true; fee $0.00 USDC.");
  console.log(`   ${aimorganFeeWaivedLabel}`);
  console.log(`3. ${vault.vault.execution === "direct-morpho" ? directMorphoLabel : "Privy Earn API deposit"}: $1.00 USDC on Base mainnet.`);
  console.log(`   Wallet: ${agent.walletAddress}`);
  console.log(`   Vault ID: ${vault.vault.id}`);
  console.log(`   Allowlisted vault: ${vault.vault.address}`);
  console.log("   Asset: canonical Base USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  if (vault.vault.execution === "direct-morpho") {
    if (depositPreview.approvalRequired) {
      console.log("   Privy signs an exact 1.00 USDC approval before the simulation.");
    } else {
      console.log(`   Reuse existing exact approval; no approval signing call: ${depositPreview.preflight.approvalTransactionHash}`);
      console.log(`   BaseScan: ${baseScan(depositPreview.preflight.approvalTransactionHash!)}`);
    }
    console.log("   The gateway simulates deposit via eth_call, then Privy signs deposit(1 USDC, agent).");
  } else {
    console.log("   Privy Earn manages the approval and deposit transaction(s).");
  }
  console.log(`Current wallet balance: ${formatUnits(BigInt(balance.rawAmount), 6)} USDC`);
  console.log(`Live vault APY: ${vault.apyBasisPoints == null ? "unavailable" : `${(vault.apyBasisPoints / 100).toFixed(2)}%`}`);
  console.log(vault.vault.execution === "direct-morpho"
    ? "The deposit is simulated after the approval confirms and before the deposit signing call."
    : "Privy offers no Earn quote/dry-run parameter; its deposit call starts execution.");
  console.log("No new mandate, signing call, or transaction submission has happened in this retry.\n");

  if (!depositPreview.preflight.allPassed) {
    console.log(`PREFLIGHT FAILED — ${depositPreview.preflight.reason}`);
    return;
  }

  if (BigInt(balance.rawAmount) < 1_000_000n) {
    console.log("NOT FUNDED — the wallet needs at least 1.00 USDC before this retry.");
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("ABORTED — live execution requires an interactive terminal confirmation.");
    return;
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question('Type exactly "CONFIRM BASE MAINNET" to execute these actions: ');
  prompt.close();
  if (answer !== "CONFIRM BASE MAINNET") {
    console.log("ABORTED — confirmation did not match. No signing call was made.");
    return;
  }

  await runtime.gateway.grantMandate({
    agentId: agent.id,
    ownerId: "owner:live-earn-retry",
    durationSeconds: 120,
    maxPerActionUsdcCents: depositUsdcCents,
    maxTotalUsdcCents: depositUsdcCents,
    allowedActions: ["aimorgan.strategize", "earn.sweep"],
  });
  const strategy = await runtime.gateway.strategize({
    agentId: agent.id,
    totalUsdcCents: depositUsdcCents,
    idempotencyKey: `live-earn-strategy-${randomUUID()}`,
  });
  const sweep = await runtime.gateway.sweepIdle({
    agentId: agent.id,
    strategyId: strategy.id,
    amountUsdcCents: depositUsdcCents,
    idempotencyKey: `live-earn-retry-${randomUUID()}`,
  });

  if (sweep.deposit.mode === "direct-morpho") {
    console.log(`\n${directMorphoLabel}`);
    console.log(`USDC approval: ${sweep.deposit.approval.transactionHash}`);
    console.log(`BaseScan: ${sweep.deposit.approval.explorerUrl}`);
    console.log(`Morpho deposit: ${sweep.deposit.deposit.transactionHash}`);
    console.log(`BaseScan: ${sweep.deposit.deposit.explorerUrl}`);
    console.log(`Vault shares received: ${sweep.deposit.sharesReceived} (${sweep.deposit.sharesReceivedRaw} raw)`);
  } else {
    console.log(`\nPrivy Earn action: ${sweep.deposit.actionId} (${sweep.deposit.status})`);
    for (const hash of sweep.deposit.transactionHashes) {
      console.log(`Earn transaction: ${hash}`);
      console.log(`BaseScan: ${baseScan(hash)}`);
    }
  }
}

main().catch((error) => {
  console.error(`\nVAULT DEPOSIT DEMO FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
