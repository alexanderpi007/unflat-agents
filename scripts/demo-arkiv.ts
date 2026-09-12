import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { RefusalError } from "../src/core/errors";
import { MemoryGatewayStore } from "../src/core/store";
import type { Agent } from "../src/core/types";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const { createApplicationRuntime } = await import("../src/server/runtime");
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  const store = new MemoryGatewayStore();
  const runtime = createApplicationRuntime({ store });
  if (runtime.health.adapters.arkiv.mode !== "live") {
    throw new Error(`Arkiv must be LIVE: ${runtime.health.adapters.arkiv.detail}`);
  }

  const agent: Agent = {
    id: randomUUID(),
    displayName: "Arkiv Expiry Proof",
    ensName: "arkiv-expiry-proof.agents.unflat.eth",
    walletId: "proof-only-no-privy-call",
    walletAddress: "0xe35285DDaBDD0d0C2F70F4067f7E06341E8a44e7",
    createdAt: new Date().toISOString(),
  };
  await store.putAgent(agent);

  console.log("\nunflat × agents — LIVE Arkiv expiry proof");
  console.log(`Agent: ${agent.id}`);
  console.log("Base mainnet actions: none\n");

  const mandate = await runtime.gateway.grantMandate({
    agentId: agent.id,
    ownerId: "owner:arkiv-proof",
    durationSeconds: 120,
    maxPerActionUsdcCents: 100,
    maxTotalUsdcCents: 105,
  });
  console.log(`Entity ID: ${mandate.arkivEntityKey}`);
  console.log(`Entity explorer: ${mandate.arkivExplorerUrl}`);
  console.log(`Creation transaction: ${mandate.arkivTransactionHash}`);
  console.log(`Transaction explorer: https://tiramisu.explorer.arkiv.network/tx/${mandate.arkivTransactionHash}`);
  console.log(`Expires at Arkiv block: ${mandate.arkivExpiresAtBlock}`);
  console.log(`Commitment: ${mandate.arkivCommitment}\n`);

  const before = await runtime.gateway.queryMandate(agent.id);
  console.log("QUERY BEFORE EXPIRY");
  console.log(JSON.stringify(before, null, 2));

  let after = before;
  while (after.found) {
    await delay(10_000);
    after = await runtime.gateway.queryMandate(agent.id);
    console.log(`Waiting: block ${after.blockNumber}, found=${after.found}`);
  }
  console.log("\nQUERY AFTER EXPIRY");
  console.log(JSON.stringify(after, null, 2));

  try {
    await runtime.gateway.transferUsdc({
      agentId: agent.id,
      recipient: "0xE8F021FA5a8E67E9C05184d9C47f2a3A749cFF27",
      amountUsdcCents: 5,
      idempotencyKey: `arkiv-expired-proof-${randomUUID()}`,
    });
    throw new Error("Expired mandate unexpectedly reached the Base action path.");
  } catch (error) {
    if (!(error instanceof RefusalError)) throw error;
    console.log(`\nGATEWAY REFUSAL\n${error.message}`);
  }

  const state = await runtime.gateway.state(agent.id);
  const completed = state.events.filter((event) =>
    event.action === "usdc.transfer" && event.status === "completed").length;
  console.log(`Signing-capable action events completed after expiry: ${completed}`);
}

main().catch((error) => {
  console.error(`\nARKIV PROOF FAILED: ${error instanceof Error ? error.message : "Unknown error"}`);
  process.exitCode = 1;
});
