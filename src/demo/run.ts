import { RefusalError } from "@/core/errors";
import { FakeClock } from "@/core/clock";
import { aimorganFeeWaivedLabel, directMorphoLabel } from "@/core/labels";
import { createOwnerStatementKey } from "@/core/statement";
import { MemoryGatewayStore } from "@/core/store";
import type { DemoSnapshot, EarnVaultRate, RuntimeHealth } from "@/core/types";
import { createApplicationRuntime, createDemoRuntime } from "@/server/runtime";

interface PrivyProof {
  walletAddress: string;
  walletId: string;
  vaultLabel: string;
  apyBasisPoints: number | null;
  source: EarnVaultRate["source"];
}

export async function runDemo(options: { publishMockStatement?: boolean } = {}): Promise<{
  snapshot: DemoSnapshot;
  steps: string[];
  health: RuntimeHealth;
  privyProof: PrivyProof;
}> {
  const configured = createApplicationRuntime({ store: new MemoryGatewayStore(), fullyMocked: true });
  const runtime = createDemoRuntime();
  const clock = runtime.deps.clock as FakeClock;
  const steps: string[] = [];

  const agent = await runtime.gateway.createAgent("Atlas");
  const configuredVault = await runtime.gateway.vaultRate();
  const privyProof: PrivyProof = {
    walletAddress: agent.walletAddress,
    walletId: agent.walletId,
    vaultLabel: configuredVault.vault.label,
    apyBasisPoints: configuredVault.apyBasisPoints,
    source: configuredVault.source,
  };
  steps.push(`Created ${agent.ensName} with the isolated MOCK wallet adapter.`);

  const mandate = await runtime.gateway.grantMandate({
    agentId: agent.id,
    ownerId: "owner:demo",
    durationSeconds: 120,
    maxPerActionUsdcCents: 100,
    maxTotalUsdcCents: 120,
  });
  steps.push(`Granted a 2-minute Arkiv-backed mandate expiring at ${mandate.expiresAt}.`);

  await runtime.gateway.transferUsdc({
    agentId: agent.id,
    recipient: "0x000000000000000000000000000000000000dEaD",
    amountUsdcCents: 5,
    idempotencyKey: "demo-transfer-001",
  });
  steps.push("MOCK SAFETY NET — transferred 0.05 USDC only after mandate, AIMorgan price, and Base preflight checks passed.");

  const strategy = await runtime.gateway.strategize({
    agentId: agent.id,
    totalUsdcCents: 100,
    idempotencyKey: "demo-strategy-001",
  });
  steps.push(`Called AIMorgan strategize with dry:true, then ?free=true. ${aimorganFeeWaivedLabel}.`);

  await runtime.gateway.sweepIdle({
    agentId: agent.id,
    strategyId: strategy.id,
    amountUsdcCents: strategy.idleFundsUsdcCents,
    idempotencyKey: "demo-sweep-001",
  });
  steps.push(`MOCK SAFETY NET — deposited exactly 1.00 USDC through the ${directMorphoLabel} path to the unflat allowlisted vault.`);

  clock.advance(121_000);
  try {
    await runtime.gateway.transferUsdc({
      agentId: agent.id,
      recipient: "0x000000000000000000000000000000000000dEaD",
      amountUsdcCents: 5,
      idempotencyKey: "demo-transfer-expired-001",
    });
    steps.push("ACCEPTED — final USDC transfer completed because the mandate is still active.");
  } catch (error) {
    if (!(error instanceof RefusalError)) throw error;
    steps.push(error.message);
  }

  const ownerStatementKey = options.publishMockStatement ? createOwnerStatementKey() : undefined;
  const statement = ownerStatementKey
    ? await runtime.gateway.publishEncryptedStatement(agent.id, ownerStatementKey)
    : undefined;
  const state = await runtime.gateway.state(agent.id);
  if (!state.mandate) throw new Error("Demo mandate disappeared.");

  return {
    steps,
    health: configured.health,
    privyProof,
    snapshot: {
      agent: state.agent,
      mandate: state.mandate,
      events: state.events,
      statementReference: statement?.reference,
      ownerStatementKey,
    },
  };
}
