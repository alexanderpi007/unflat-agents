import { RefusalError } from "@/core/errors";
import { FakeClock } from "@/core/clock";
import { createOwnerStatementKey } from "@/core/statement";
import type { DemoSnapshot } from "@/core/types";
import { createDeterministicDemoRuntime } from "@/server/runtime";

export async function runDemo(): Promise<{ snapshot: DemoSnapshot; steps: string[] }> {
  const runtime = createDeterministicDemoRuntime();
  const clock = runtime.deps.clock as FakeClock;
  const steps: string[] = [];

  const agent = await runtime.gateway.createAgent("Atlas");
  steps.push(`Created ${agent.ensName} with a Privy agent wallet.`);

  const mandate = await runtime.gateway.grantMandate({
    agentId: agent.id,
    ownerId: "owner:demo",
    durationSeconds: 120,
    maxPerActionUsdcCents: 1_000,
    maxTotalUsdcCents: 2_000,
  });
  steps.push(`Granted a 2-minute Arkiv-backed mandate expiring at ${mandate.expiresAt}.`);

  await runtime.gateway.payX402({
    agentId: agent.id,
    resource: "https://demo.weather.example/report",
    idempotencyKey: "demo-payment-001",
  });
  steps.push("Paid an x402 resource only after mandate and AIMorgan price checks passed.");

  const strategy = await runtime.gateway.strategize({
    agentId: agent.id,
    totalUsdcCents: 1_500,
    idempotencyKey: "demo-strategy-001",
  });
  steps.push("Called AIMorgan strategize with dry:true, then made the paid REST call.");

  await runtime.gateway.sweepIdle({
    agentId: agent.id,
    strategyId: strategy.id,
    amountUsdcCents: strategy.idleFundsUsdcCents,
    idempotencyKey: "demo-sweep-001",
  });
  steps.push("Swept idle USDC through Privy Earn to the unflat allowlisted Morpho vault.");

  clock.advance(121_000);
  try {
    await runtime.gateway.payX402({
      agentId: agent.id,
      resource: "https://demo.weather.example/second-report",
      idempotencyKey: "demo-payment-expired-001",
    });
  } catch (error) {
    if (!(error instanceof RefusalError)) throw error;
    steps.push(error.message);
  }

  const ownerStatementKey = createOwnerStatementKey();
  const statement = await runtime.gateway.publishEncryptedStatement(agent.id, ownerStatementKey);
  const state = await runtime.gateway.state(agent.id);
  if (!state.mandate) throw new Error("Demo mandate disappeared.");

  return {
    steps,
    snapshot: {
      agent: state.agent,
      mandate: state.mandate,
      events: state.events,
      statementReference: statement.reference,
      ownerStatementKey,
    },
  };
}
