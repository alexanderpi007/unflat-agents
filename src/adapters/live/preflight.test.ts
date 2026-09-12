import { describe, expect, it } from "vitest";
import { evaluateEarnReadiness } from "./preflight";

const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

describe("vault deposit preflight", () => {
  it("accepts an allowlisted vault with canonical USDC and enough balance", () => {
    expect(evaluateEarnReadiness({
      assetAddress: baseUsdc,
      balance: 4_950_000n,
      rawAmount: 1_000_000n,
    })).toMatchObject({ allPassed: true });
  });

  it("fails closed for a non-USDC vault asset", () => {
    expect(evaluateEarnReadiness({
      assetAddress: "0x0000000000000000000000000000000000000001",
      balance: 4_950_000n,
      rawAmount: 1_000_000n,
    })).toMatchObject({ allPassed: false });
  });

  it("fails closed when the wallet cannot cover the deposit", () => {
    expect(evaluateEarnReadiness({
      assetAddress: baseUsdc,
      balance: 999_999n,
      rawAmount: 1_000_000n,
    })).toMatchObject({ allPassed: false });
  });
});
