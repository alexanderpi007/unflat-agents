import { randomUUID } from "node:crypto";
import { RefusalError } from "@/core/errors";
import { MemoryGatewayStore } from "@/core/store";
import type { Agent, DemoSnapshot, ArkivMandateQuery } from "@/core/types";
import { createApplicationRuntime, type GatewayRuntime } from "@/server/runtime";

export const persistentAgentId = "a7100000-0000-4000-8000-000000000001";
export const persistentWalletAddress = "0xe35285DDaBDD0d0C2F70F4067f7E06341E8a44e7";
export type DemoMoney = "mock" | "live";
export type DashboardUpdate = {
  snapshot?: DemoSnapshot; moneyMode: DemoMoney; phase: string;
  query?: ArkivMandateQuery; expired?: boolean; error?: string; detail?: string;
};

export function dashboardRuntime(mode: DemoMoney) {
  const runtime = createApplicationRuntime({ mockMoney: mode === "mock", store: mode === "mock" ? new MemoryGatewayStore() : undefined });
  if (mode === "mock" && !runtime.deps.demoPaymentRecipient) runtime.deps.demoPaymentRecipient = "0x000000000000000000000000000000000000dEaD";
  return runtime;
}

export async function demoAgent(runtime: GatewayRuntime, mode: DemoMoney): Promise<Agent> {
  if (mode === "live") {
    const agent = await runtime.deps.store.getAgent(persistentAgentId);
    if (!agent || agent.walletAddress.toLowerCase() !== persistentWalletAddress.toLowerCase()) {
      throw new Error("Persistent Privy wallet missing or different. Restore the local gateway store; no new wallet was created.");
    }
    return agent;
  }
  // Isolate each public mandate/accounting session while displaying the same wallet; never provision a wallet.
  const agent: Agent = { id: randomUUID(), displayName: "Atlas", ensName: "atlas.agents.unflat.eth",
    walletAddress: persistentWalletAddress, walletId: "mock-money-no-signing-wallet",
    createdAt: new Date().toISOString() };
  await runtime.deps.store.putAgent(agent);
  return agent;
}

export function requireDemoAdapters(runtime: GatewayRuntime, mode: DemoMoney) {
  if (runtime.health.adapters.arkiv.mode !== "live") throw new Error("A funded ARKIV_PRIVATE_KEY is required. Dashboard mandates must be real; use demo:mock offline.");
  if (mode === "live" && (process.env.VERCEL || runtime.health.adapters.privy.mode !== "live"
    || runtime.health.adapters.aiMorgan.mode !== "live" || runtime.deps.aiMorganX402 || runtime.deps.earnViaPrivy)) {
    throw new Error("LIVE requires local Privy + AIMorgan, AIMORGAN_X402=false and EARN_VIA_PRIVY=false. No mock substitution allowed.");
  }
}

export async function runDashboardSequence(runtime: GatewayRuntime, agent: Agent, mode: DemoMoney, runId: string,
  emit: (update: DashboardUpdate) => void, wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {
  const { gateway, deps } = runtime;
  const recipient = deps.demoPaymentRecipient;
  if (!recipient) throw new Error("DEMO_PAYMENT_RECIPIENT is required.");
  const previousCount = (await deps.store.listEvents(agent.id)).length;
  const update = async (phase: string, query?: ArkivMandateQuery, expired = false) => {
    const state = await gateway.state(agent.id);
    const events = state.events.slice(previousCount).map(event => mode === "mock" ? {
      ...event,
      reason: event.action === "mandate.grant" || event.status === "refused" ? event.reason
        : `MOCK MONEY — ${event.reason.replace(/https:\/\/basescan\.org\/tx\/0x[0-9a-f]+/gi, "[simulated transaction; no BaseScan proof]")}`,
    } : event);
    emit({ moneyMode: mode, phase, query, expired,
      snapshot: state.mandate ? { agent: state.agent, mandate: state.mandate, events } : undefined });
  };
  if (mode === "live") {
    const balance = await gateway.usdcBalance(agent.id);
    if (BigInt(balance.rawAmount) < 1_050_000n) throw new Error("Agent needs at least 1.05 USDC plus Base gas.");
    const preview = await gateway.previewVaultDeposit({ agentId: agent.id, amountUsdcCents: 100 });
    if (!preview.preflight.allPassed) throw new Error(preview.preflight.reason);
  }
  await gateway.grantMandate({ agentId: agent.id, ownerId: `owner:${mode}-dashboard`, durationSeconds: 120,
    maxPerActionUsdcCents: 100, maxTotalUsdcCents: 105 });
  const before = await deps.arkiv.findValidMandates(agent.id);
  if (!before.found) throw new Error("New Arkiv mandate not queryable; no spend attempted.");
  await update("Mandate found on Tiramisu", before);
  const transfer = (suffix: string) => gateway.transferUsdc({ agentId: agent.id, recipient,
    amountUsdcCents: 5, idempotencyKey: `${runId}-${suffix}` });
  await transfer("transfer");
  await update("0.05 USDC spend completed");
  const strategy = await gateway.strategize({ agentId: agent.id, totalUsdcCents: 100, idempotencyKey: `${runId}-strategy` });
  await update("Strategy validated");
  await gateway.sweepIdle({ agentId: agent.id, strategyId: strategy.id, amountUsdcCents: 100, idempotencyKey: `${runId}-deposit` });
  await update("1 USDC deposit completed; waiting for real Arkiv expiry");
  const deadline = Date.now() + 180_000;
  let after = await deps.arkiv.findValidMandates(agent.id);
  while (after.found && Date.now() < deadline) {
    await update("Waiting for natural Arkiv expiration", after);
    await wait(4000);
    after = await deps.arkiv.findValidMandates(agent.id);
  }
  if (after.found) throw new Error("Arkiv entity still exists; expiry not proven. No final action attempted.");
  try { await transfer("expired"); throw new Error("Unexpected acceptance after expiry."); }
  catch (error) { if (!(error instanceof RefusalError)) throw error; }
  await update("EXPIRED — gateway refused", after, true);
}
