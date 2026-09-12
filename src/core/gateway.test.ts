import { describe, expect, it } from "vitest";
import { FakeClock } from "./clock";
import { RefusalError } from "./errors";
import { aimorganFeeWaivedLabel, directMorphoLabel } from "./labels";
import type { PriceValidation, X402Quote } from "./types";
import { createMockRuntime, demoVault } from "@/server/runtime";

const start = () => new FakeClock(new Date());

async function ready(clock = start(), aiMorganX402 = false) {
  const runtime = createMockRuntime(clock, undefined, aiMorganX402);
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
  it("reuses the one persisted agent wallet instead of creating another", async () => {
    const runtime = createMockRuntime(start());
    const agentId = "a7100000-0000-4000-8000-000000000001";

    const first = await runtime.gateway.getOrCreateAgent(agentId, "Atlas");
    const second = await runtime.gateway.getOrCreateAgent(agentId, "Atlas");

    expect(first.reused).toBe(false);
    expect(second).toEqual({ agent: first.agent, reused: true });
    expect(runtime.wallet.calls.filter((call) => call === "createWallet")).toHaveLength(1);
  });

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
    expect(runtime.x402.calls).not.toContain("submit");
    const state = await runtime.gateway.state(runtime.agent.id);
    expect(state.events.at(-1)?.reason).toContain("mandate expired");
    expect(state.events.at(-1)?.reason).toContain("No revocation was needed");
  });

  it("refuses an expired USDC transfer before validation, preflight, or Privy signing", async () => {
    const runtime = await ready();
    runtime.clock.advance(120_000);

    await expect(runtime.gateway.transferUsdc({
      agentId: runtime.agent.id,
      recipient: "0x000000000000000000000000000000000000dEaD",
      amountUsdcCents: 5,
      idempotencyKey: "expired-transfer",
    })).rejects.toThrow(RefusalError);

    expect(runtime.aiMorgan.strategizeCalls).toHaveLength(0);
    expect(runtime.wallet.calls.filter((call) => call.startsWith("transferUsdc"))).toHaveLength(0);
  });

  it("does not invent a vault APY in mock mode", async () => {
    const runtime = await ready();

    await expect(runtime.gateway.vaultRate()).resolves.toMatchObject({
      vault: demoVault,
      apyBasisPoints: null,
      provider: "Morpho",
      source: "mock-unavailable",
    });
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

  it("runs dry strategize before the fee-waived call without signing", async () => {
    const runtime = await ready();

    const strategy = await runtime.gateway.strategize({
      agentId: runtime.agent.id,
      totalUsdcCents: 1_500,
      idempotencyKey: "ordered-strategy",
    });

    expect(runtime.aiMorgan.strategizeCalls).toEqual([true, false]);
    expect(runtime.wallet.calls.filter((call) => call.startsWith("signX402"))).toHaveLength(0);
    expect(strategy.aimorganFeeMode).toBe("waived");
    const state = await runtime.gateway.state(runtime.agent.id);
    expect(state.events.at(-1)?.reason).toContain(aimorganFeeWaivedLabel);
  });

  it("refuses a changed x402 quote after confirmation without signing", async () => {
    const runtime = await ready(start(), true);
    const preview = await runtime.gateway.previewStrategize({
      agentId: runtime.agent.id,
      totalUsdcCents: 100,
    });
    if (preview.mode !== "x402") throw new Error("Test runtime did not enable AIMorgan x402.");

    await expect(runtime.gateway.strategize({
      agentId: runtime.agent.id,
      totalUsdcCents: 100,
      idempotencyKey: "changed-confirmed-quote",
      confirmedQuote: { ...preview.quote, amountAtomic: "60000" },
    })).rejects.toThrow("live x402 quote changed after confirmation");

    expect(runtime.wallet.calls.filter((call) => call.startsWith("signX402"))).toHaveLength(0);
  });

  it("executes the configured USDC transfer only after validation and records its Base hash", async () => {
    const runtime = await ready();
    const recipient = "0x000000000000000000000000000000000000dEaD" as const;
    const mockTransfer = runtime.wallet.transferUsdc.bind(runtime.wallet);
    runtime.wallet.transferUsdc = async (input) => {
      const transfer = await mockTransfer(input);
      return {
        ...transfer,
        source: "privy-live" as const,
        explorerUrl: `https://basescan.org/tx/${transfer.transactionHash}`,
      };
    };

    const result = await runtime.gateway.transferUsdc({
      agentId: runtime.agent.id,
      recipient,
      amountUsdcCents: 5,
      idempotencyKey: "accepted-transfer",
    });

    expect(runtime.aiMorgan.strategizeCalls).toEqual([true]);
    expect(runtime.wallet.calls).toContain(`transferUsdc:${recipient}:5`);
    const state = await runtime.gateway.state(runtime.agent.id);
    expect(state.events.at(-1)).toMatchObject({
      action: "usdc.transfer",
      status: "completed",
      reference: result.transfer.transactionHash,
    });
    expect(state.events.at(-1)?.reason).toContain(`https://basescan.org/tx/${result.transfer.transactionHash}`);
  });

  it("refuses a USDC transfer when AIMorgan price validation fails", async () => {
    const runtime = await ready();
    runtime.aiMorgan.validationPasses = false;

    await expect(runtime.gateway.transferUsdc({
      agentId: runtime.agent.id,
      recipient: "0x000000000000000000000000000000000000dEaD",
      amountUsdcCents: 5,
      idempotencyKey: "invalid-transfer-price",
    })).rejects.toThrow("priceValidation.allPassed is absent or false");

    expect(runtime.wallet.calls.filter((call) => call.startsWith("transferUsdc"))).toHaveLength(0);
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
    expect(runtime.wallet.calls).toContain(`approveUsdc:${demoVault.address}:900`);
    expect(runtime.wallet.calls).toContain(`depositDirectVault:${demoVault.address}:900`);
    expect(runtime.wallet.calls).not.toContain("depositDirectVault:aimorgan-untrusted-vault:900");
    expect(runtime.preflight.calls).toEqual(["verifyEarn:direct-morpho", "simulateDirectDeposit"]);
    const state = await runtime.gateway.state(runtime.agent.id);
    const approvalEvent = state.events.find((event) => event.action === "earn.approve");
    const depositEvent = state.events.find((event) => event.action === "earn.sweep");
    expect(approvalEvent).toMatchObject({ status: "completed", reference: `0x${"4".repeat(64)}` });
    expect(depositEvent).toMatchObject({ status: "completed", reference: `0x${"2".repeat(64)}` });
    expect(approvalEvent?.reason).toContain(directMorphoLabel);
    expect(depositEvent?.reason).toContain("Received 1 vault shares");
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

    expect(runtime.wallet.calls.filter((call) => call.startsWith("deposit"))).toHaveLength(0);
  });

  it("checks the mandate again before the direct deposit signing call", async () => {
    const runtime = await ready();
    const strategy = await runtime.gateway.strategize({
      agentId: runtime.agent.id,
      totalUsdcCents: 100,
      idempotencyKey: "strategy-before-expiry",
    });
    const simulate = runtime.preflight.simulateDirectDeposit.bind(runtime.preflight);
    runtime.preflight.simulateDirectDeposit = async (input) => {
      const result = await simulate(input);
      runtime.clock.advance(121_000);
      return result;
    };

    await expect(runtime.gateway.sweepIdle({
      agentId: runtime.agent.id,
      strategyId: strategy.id,
      amountUsdcCents: 100,
      idempotencyKey: "expires-after-approval",
    })).rejects.toThrow("mandate expired");

    expect(runtime.wallet.calls).toContain(`approveUsdc:${demoVault.address}:100`);
    expect(runtime.wallet.calls.filter((call) => call.startsWith("depositDirectVault"))).toHaveLength(0);
  });

  it("reuses an on-chain exact approval proof without signing a duplicate approval", async () => {
    const runtime = await ready();
    const strategy = await runtime.gateway.strategize({
      agentId: runtime.agent.id,
      totalUsdcCents: 100,
      idempotencyKey: "strategy-with-approval",
    });
    const approvalHash = `0x${"5".repeat(64)}` as const;
    runtime.preflight.verifyEarn = async (input) => ({
      allPassed: true,
      reason: "Exact allowance is already confirmed on Base.",
      assetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      balanceRawAmount: "1000000000",
      allowanceRawAmount: "1000000",
      approvalTransactionHash: approvalHash,
      execution: input.execution,
    });

    const result = await runtime.gateway.sweepIdle({
      agentId: runtime.agent.id,
      strategyId: strategy.id,
      amountUsdcCents: 100,
      idempotencyKey: "reuse-exact-approval",
    });

    expect(runtime.wallet.calls.filter((call) => call.startsWith("approveUsdc"))).toHaveLength(0);
    expect(runtime.wallet.calls).toContain(`depositDirectVault:${demoVault.address}:100`);
    expect(result.deposit.mode).toBe("direct-morpho");
    const state = await runtime.gateway.state(runtime.agent.id);
    expect(state.events.find((event) => event.action === "earn.approve")).toMatchObject({
      reference: approvalHash,
      reason: expect.stringContaining("no approval was signed again"),
    });
  });

  it("keeps the Privy Earn API path behind the explicit flag", async () => {
    const clock = start();
    const runtime = createMockRuntime(clock, undefined, false, true);
    const agent = await runtime.gateway.createAgent("Atlas");
    await runtime.gateway.grantMandate({
      agentId: agent.id,
      ownerId: "owner:test",
      durationSeconds: 120,
      maxPerActionUsdcCents: 100,
      maxTotalUsdcCents: 100,
    });
    const strategy = await runtime.gateway.strategize({
      agentId: agent.id,
      totalUsdcCents: 100,
      idempotencyKey: "privy-strategy",
    });

    const result = await runtime.gateway.sweepIdle({
      agentId: agent.id,
      strategyId: strategy.id,
      amountUsdcCents: 100,
      idempotencyKey: "privy-earn-flag",
    });

    expect(result.vault.execution).toBe("privy-earn-api");
    expect(result.deposit.mode).toBe("privy-earn");
    expect(runtime.wallet.calls).toContain("verifyPrivyEarnVault");
    expect(runtime.wallet.calls).toContain("depositEarn:mock-privy-earn-vault");
    expect(runtime.wallet.calls.filter((call) => call.startsWith("approveUsdc"))).toHaveLength(0);
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
