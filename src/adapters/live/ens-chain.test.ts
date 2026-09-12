import { beforeEach, expect, it, vi } from "vitest";
import { EnsChain } from "./ens-chain";

const fixture = vi.hoisted(() => ({
  getChainId: vi.fn(async () => 11155111),
  simulateContract: vi.fn(async () => ({ request: {} })),
  writeContract: vi.fn(async () => `0x${"1".repeat(64)}`),
  waitForTransactionReceipt: vi.fn(async () => ({ status: "success", transactionHash: `0x${"1".repeat(64)}` })),
}));
vi.mock("viem", async original => ({ ...await original<typeof import("viem")>(),
  createPublicClient: () => fixture, createWalletClient: () => fixture,
}));
const key = `0x${"1".repeat(64)}` as const;
const target = `0x${"2".repeat(40)}` as const;
beforeEach(() => { vi.clearAllMocks(); });

it("serializes concurrent ENS writes across instances until the shared signer's receipt confirms", async () => {
  let release = () => {};
  const confirmed = new Promise<void>(resolve => { release = resolve; });
  fixture.waitForTransactionReceipt.mockImplementationOnce(async () => {
    await confirmed;
    return { status: "success", transactionHash: `0x${"1".repeat(64)}` };
  });
  const first = new EnsChain(key, "https://rpc.invalid").write(target, [], "register", []);
  const second = new EnsChain(key, "https://rpc.invalid").write(target, [], "setText", []);
  await vi.waitFor(() => expect(fixture.waitForTransactionReceipt).toHaveBeenCalledTimes(1));
  expect(fixture.writeContract).toHaveBeenCalledTimes(1);
  release(); await Promise.all([first, second]);
  expect(fixture.writeContract).toHaveBeenCalledTimes(2);
});

it("releases the ENS signer queue after a failed preflight without retrying that write", async () => {
  fixture.simulateContract.mockRejectedValueOnce(new Error("simulation refused"));
  const chain = new EnsChain(key, "https://rpc.invalid");
  await expect(chain.write(target, [], "register", [])).rejects.toThrow("simulation refused");
  await chain.write(target, [], "setText", []);
  expect(fixture.writeContract).toHaveBeenCalledTimes(1);
});
