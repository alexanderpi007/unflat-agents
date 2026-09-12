import { describe, expect, it, vi } from "vitest";
import { BaseEarnPreflightAdapter, evaluateEarnReadiness } from "./preflight";

const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

function simulatedRpc() {
  const adapter = new BaseEarnPreflightAdapter("http://unused.invalid");
  const rpc = {
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success", blockNumber: 20n }),
    getBlockNumber: vi.fn().mockResolvedValue(21n),
    readContract: vi.fn().mockResolvedValue(1_000_000n),
    simulateContract: vi.fn().mockResolvedValue({ result: 99n }),
  };
  Object.assign((adapter as unknown as { client: object }).client, rpc);
  const input = { walletAddress: baseUsdc, vaultAddress: baseUsdc, amountUsdcCents: 100,
    approvalTransactionHash: `0x${"1".repeat(64)}` as const };
  return { adapter, rpc, input };
}

it("waits for receipt and pins allowance and eth_call to the same post-approval block", async () => {
  const { adapter, rpc, input } = simulatedRpc();
  expect(await adapter.simulateDirectDeposit(input)).toMatchObject({ allPassed: true });
  expect(rpc.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "allowance", blockNumber: 21n }));
  expect(rpc.simulateContract).toHaveBeenCalledWith(expect.objectContaining({ blockNumber: 21n }));
  expect(rpc.waitForTransactionReceipt.mock.invocationCallOrder[0]).toBeLessThan(rpc.readContract.mock.invocationCallOrder[0]);
});

it("retries a lagging head once, without simulating pre-approval state", async () => {
  const { adapter, rpc, input } = simulatedRpc();
  rpc.getBlockNumber.mockResolvedValueOnce(19n).mockResolvedValueOnce(20n);
  expect(await adapter.simulateDirectDeposit(input)).toMatchObject({ allPassed: true });
  expect(rpc.waitForTransactionReceipt).toHaveBeenCalledTimes(2);
  expect(rpc.simulateContract).toHaveBeenCalledTimes(1);
});

it("stops on a vault-side revert without retrying", async () => {
  const { adapter, rpc, input } = simulatedRpc();
  rpc.simulateContract.mockRejectedValue({ shortMessage: "AbsoluteCapExceeded()" });
  expect(await adapter.simulateDirectDeposit(input)).toMatchObject({ allPassed: false, reason: expect.stringContaining("AbsoluteCapExceeded") });
  expect(rpc.simulateContract).toHaveBeenCalledTimes(1);
});

it("never attempts a third simulation", async () => {
  const { adapter, rpc, input } = simulatedRpc();
  rpc.simulateContract.mockRejectedValue({ shortMessage: "TransferFromReverted()" });
  expect(await adapter.simulateDirectDeposit(input)).toMatchObject({ allPassed: false });
  expect(rpc.simulateContract).toHaveBeenCalledTimes(2);
});

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
