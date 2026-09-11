import { describe, expect, it } from "vitest";
import { FakeClock } from "./clock";
import { RefusalError } from "./errors";
import type { PriceValidation, X402Quote } from "./types";
import { createMockRuntime, demoVault } from "@/server/runtime";

const start = () => new FakeClock(new Date("2026-10-16T16:00:00.000Z"));

async function ready(clock = start()) {
  const runtime = createMockRuntime(clock);
  const agent = await runtime.gateway.createAgent("Atlas");
  await runtime.gateway.grantMandate({
    agentId: agent.id,
    ownerId: "owner:test",
    durationSeconds: 120,
    maxPerActionUsdcCents: 1_000,
    maxTotalUsdcCents: 2_000,
  });
  return { ...runtime, agent, clock };
}

describe("SigningGateway safety boundary", () => {
  it("refuses after TTL expiry without calling a signing-capable wallet method", async () => {
    const runtime = await ready();
    runtime.clock.advance(120_000);

    await expect(
      runtime.gateway.payX402({
        agentId: runtime.agent.id,
        resource: "https://paid.example/data",
        idempotencyKey: "expired-payment",
      }),
    ).rejects.toThrow(RefusalError);

    expect(runtime.wallet.calls.filter((call) => call.startsWith("signX402"))).toHaveLength(0);
    const state = await runtime.gateway.state(runtime.agent.id);
    expect(state.events.at(-1)?.reason).toContain("mandate expired");
    expect(state.events.at(-1)?.reason).toContain("No revocation was needed");
  });

  it("fails closed when AIMorgan priceValidation is false", async () => {
    const runtime = await ready();
    runtime.aiMorgan.validationPasses = false;

    await expect(
      runtime.gateway.payX402({
        agentId: runtime.agent.id,
        resource: "https://paid.example/data",
        idempotencyKey: "bad-price-validation",
      }),
    ).rejects.toThrow("priceValidation.allPassed is absent or false");

    expect(runtime.wallet.calls.filter((call) => call.startsWith("signX402"))).toHaveLength(0);
  });

  it("runs dry strategize before the paid call", async () => {
    const runtime = await ready();

    await runtime.gateway.strategize({
      agentId: runtime.agent.id,
      totalUsdcCents: 1_500,
      idempotencyKey: "ordered-strategy",
    });

    expect(runtime.aiMorgan.strategizeCalls).toEqual([true, false]);
    expect(runtime.wallet.calls.filter((call) => call.startsWith("signX402"))).toHaveLength(1);
  });

  it("re-checks expiry after network preflight and immediately before signing", async () => {
    const runtime = await ready();
    const originalValidate = runtime.aiMorgan.validatePrice.bind(runtime.aiMorgan);
    runtime.aiMorgan.validatePrice = async (quote: X402Quote): Promise<PriceValidation> => {
      runtime.clock.advance(121_000);
      return originalValidate(quote);
    };

    await expect(
      runtime.gateway.payX402({
        agentId: runtime.agent.id,
        resource: "https://slow.example/data",
        idempotencyKey: "expires-during-preflight",
      }),
    ).rejects.toThrow("mandate expired");

    expect(runtime.wallet.calls.filter((call) => call.startsWith("signX402"))).toHaveLength(0);
  });

  it("ignores advisory vault picks and deposits only to the unflat allowlist", async () => {
    const runtime = await ready();
    const strategy = await runtime.gateway.strategize({
      agentId: runtime.agent.id,
      totalUsdcCents: 1_500,
      idempotencyKey: "strategy-for-sweep",
    });
    expect(strategy.advisoryVaultIds).toContain("aimorgan-untrusted-vault");

    const result = await runtime.gateway.sweepIdle({
      agentId: runtime.agent.id,
      strategyId: strategy.id,
      amountUsdcCents: 900,
      idempotencyKey: "allowlisted-sweep",
    });

    expect(result.vault.id).toBe(demoVault.id);
    expect(runtime.wallet.calls).toContain(`depositEarn:${demoVault.id}`);
    expect(runtime.wallet.calls).not.toContain("depositEarn:aimorgan-untrusted-vault");
  });

  it("does not accept caller-forged strategy validation", async () => {
    const runtime = await ready();

    await expect(
      runtime.gateway.sweepIdle({
        agentId: runtime.agent.id,
        strategyId: "caller-says-all-passed",
        amountUsdcCents: 100,
        idempotencyKey: "forged-strategy",
      }),
    ).rejects.toThrow("Validated strategy not found");

    expect(runtime.wallet.calls.filter((call) => call.startsWith("depositEarn"))).toHaveLength(0);
  });

  it("returns the stored result on idempotent replay without signing twice", async () => {
    const runtime = await ready();
    const input = {
      agentId: runtime.agent.id,
      resource: "https://paid.example/idempotent",
      idempotencyKey: "same-payment-key",
    };

    const first = await runtime.gateway.payX402(input);
    const second = await runtime.gateway.payX402(input);

    expect(second).toEqual(first);
    expect(runtime.wallet.calls.filter((call) => call.startsWith("signX402"))).toHaveLength(1);
  });
});
