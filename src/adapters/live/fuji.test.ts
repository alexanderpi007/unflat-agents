import { beforeEach, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, erc20Abi, decodeFunctionData } from "viem";
import { PrivyWalletAdapter } from "./privy";
import { BaseEarnPreflightAdapter } from "./preflight";
import { createMockRuntime } from "@/server/runtime";
import { FakeClock } from "@/core/clock";
import { SigningGateway } from "@/core/gateway";
import { chainConfig } from "@/core/chains";

const send = vi.hoisted(() => vi.fn());
vi.mock("@privy-io/node", () => ({ PrivyClient: class { wallets() { return { ethereum: () => ({ sendTransaction: send }) }; } } }));
const fuji = chainConfig("avalanche-fuji"), hash = `0x${"7".repeat(64)}` as const;
beforeEach(() => { send.mockReset().mockResolvedValue({ caip2: fuji.network, hash }); });

async function fixture() {
  const clock = new FakeClock(new Date("2026-09-13T10:00:00Z"));
  const runtime = createMockRuntime(clock);
  const agent = await runtime.gateway.createAgent("fuji-agent", "avalanche-fuji");
  const recipient = runtime.deps.demoPaymentRecipient!;
  const preflight = new BaseEarnPreflightAdapter("http://base.invalid", "http://fuji.invalid");
  const rpc = { getChainId: vi.fn().mockResolvedValue(43113),
    readContract: vi.fn(async ({ functionName }: { functionName: string }): Promise<number | bigint> => {
      if (functionName === "decimals") return 6;
      if (functionName === "balanceOf") return 1_000_000n;
      throw new Error(`Unexpected RPC read: ${functionName}`);
    }),
    getBalance: vi.fn().mockResolvedValue(1_000_000_000_000_000n),
    estimateContractGas: vi.fn().mockResolvedValue(65_000n),
    estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1n }),
  };
  Object.assign((preflight as unknown as { transfers: { clients: { "avalanche-fuji": object } } }).transfers.clients["avalanche-fuji"], rpc);
  const wallet = new PrivyWalletAdapter("test-app", "test-secret", "test-authorization-key", "test-policy", "http://base.invalid", "test-signer", "http://fuji.invalid");
  const receipt = { status: "success", from: agent.walletAddress, to: fuji.usdc, transactionHash: hash, logs: [{ address: fuji.usdc,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from: agent.walletAddress, to: recipient } }),
    data: encodeAbiParameters([{ type: "uint256" }], [50_000n]),
  }] };
  const wait = vi.fn().mockResolvedValue(receipt);
  const baseWait = vi.fn().mockRejectedValue(new Error("Base must never be used by a Fuji payment"));
  Object.assign((wallet as unknown as { fujiClient: object }).fujiClient, { waitForTransactionReceipt: wait });
  Object.assign((wallet as unknown as { baseClient: object }).baseClient, { waitForTransactionReceipt: baseWait });
  const gateway = new SigningGateway({ ...runtime.deps, wallet, preflight });
  await gateway.grantMandate({ agentId: agent.id, ownerId: "owner:test", durationSeconds: 120, maxTotalUsdcCents: 120, maxPerActionUsdcCents: 100 });
  const pay = (key = "fuji-pay-one") => gateway.transferUsdc({ agentId: agent.id, recipient, amountUsdcCents: 5, idempotencyKey: key });
  return { ...runtime, gateway, agent, clock, rpc, pay, wait, baseWait, recipient, preflight, receipt };
}

it("pays Circle USDC on Fuji through Privy under the Arkiv mandate and records Snowtrace", async () => {
  const f = await fixture();
  const result = await f.pay();
  expect(result).toMatchObject({ chain: "avalanche-fuji", transfer: { network: "eip155:43113", source: "privy-live", explorerUrl: `${fuji.explorerUrl}/tx/${hash}` } });
  expect(send).toHaveBeenCalledTimes(1);
  const [walletId, request] = send.mock.calls[0];
  expect(walletId).toBe(f.agent.walletId);
  expect(request).toMatchObject({ caip2: "eip155:43113", idempotency_key: "fuji-pay-one", authorization_context: { authorization_private_keys: ["test-authorization-key"] },
    params: { transaction: { to: fuji.usdc, chain_id: 43113, value: "0x0" } } });
  expect(decodeFunctionData({ abi: erc20Abi, data: request.params.transaction.data })).toEqual({ functionName: "transfer", args: [f.recipient, 50_000n] });
  expect(f.baseWait).not.toHaveBeenCalled();
  expect(f.rpc.readContract.mock.calls.every(([call]) => ["decimals", "balanceOf"].includes(call.functionName))).toBe(true);
  expect((await f.gateway.state(f.agent.id)).events.at(-1)).toMatchObject({ chain: "avalanche-fuji", action: "usdc.transfer", status: "completed", reference: hash, reason: expect.stringContaining("testnet.snowtrace.io/tx/") });
  expect((await f.gateway.state(f.agent.id)).mandate!.spentUsdcCents).toBe(5);
  await f.pay();
  expect(send).toHaveBeenCalledTimes(1);
});

it("refuses expired Fuji permission before advice, RPC preflight or Privy signing", async () => {
  const f = await fixture(); f.clock.advance(121_000);
  await expect(f.pay()).rejects.toThrow("mandate expired or absent");
  expect(f.aiMorgan.strategizeCalls).toEqual([]);
  expect(f.rpc.getChainId).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  expect(f.x402.calls).toEqual([]);
});

it("requeries Arkiv after preflight; expiry during RPC work cannot reach signing", async () => {
  const f = await fixture();
  f.rpc.estimateContractGas.mockImplementation(async () => { f.clock.advance(121_000); return 65_000n; });
  await expect(f.pay()).rejects.toThrow("mandate expired or absent");
  expect(send).not.toHaveBeenCalled();
});

it.each(["no AVAX", "no USDC", "wrong RPC chain", "wrong decimals", "gas simulation reverted", "price validation failed"])("refuses safely when %s", async condition => {
  const f = await fixture();
  if (condition === "no AVAX") f.rpc.getBalance.mockResolvedValue(0n);
  if (condition === "no USDC") f.rpc.readContract.mockImplementation(async ({ functionName }) => functionName === "decimals" ? 6 : 1n);
  if (condition === "wrong RPC chain") f.rpc.getChainId.mockResolvedValue(8453);
  if (condition === "wrong decimals") f.rpc.readContract.mockImplementation(async ({ functionName }) => functionName === "decimals" ? 18 : 1_000_000n);
  if (condition === "gas simulation reverted") f.rpc.estimateContractGas.mockRejectedValue(new Error("transfer reverted"));
  if (condition === "price validation failed") f.aiMorgan.validationPasses = false;
  await expect(f.pay()).rejects.toThrow("REFUSED"); expect(send).not.toHaveBeenCalled();
  expect((await f.gateway.state(f.agent.id)).mandate!.spentUsdcCents).toBe(0);
});

it("refuses Fuji savings and x402 without advice, allowances, approvals or deposits", async () => {
  const f = await fixture();
  await expect(f.gateway.sweepIdle({ agentId: f.agent.id, strategyId: "no-strategy-needed", amountUsdcCents: 100, idempotencyKey: "fuji-save" })).rejects.toThrow("not supported on this chain");
  await expect(f.gateway.payX402({ agentId: f.agent.id, resource: "https://aimorgan.net", idempotencyKey: "fuji-x402" })).rejects.toThrow("not supported on this chain");
  expect(f.aiMorgan.strategizeCalls).toEqual([]); expect(f.x402.calls).toEqual([]);
  expect(f.rpc.getChainId).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  expect((await f.gateway.state(f.agent.id)).events.filter(e => e.status === "refused")).toHaveLength(2);
});

it("reads the balance on Fuji, not Base, and refuses a wrong-network Privy receipt", async () => {
  const f = await fixture();
  expect(await f.gateway.usdcBalance(f.agent.id)).toEqual({ rawAmount: "1000000", amountUsdcCents: 100 });
  expect(f.rpc.readContract).toHaveBeenCalledWith(expect.objectContaining({ address: fuji.usdc, functionName: "balanceOf", args: [f.agent.walletAddress] }));
  send.mockResolvedValue({ caip2: "eip155:8453", hash });
  await expect(f.pay()).rejects.toThrow("invalid Avalanche Fuji testnet response");
  expect(f.wait).not.toHaveBeenCalled(); expect(f.baseWait).not.toHaveBeenCalled();
});
