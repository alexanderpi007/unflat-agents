import { createPublicClient, createWalletClient, http, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const shared = globalThis as typeof globalThis & { unflatEnsSignerLocks?: Map<string, Promise<void>> };
const signerLocks = shared.unflatEnsSignerLocks ??= new Map();

export class EnsChain {
  readonly publicClient;
  readonly account;
  private readonly wallet;
  constructor(key: Hex, rpc: string) {
    this.account = privateKeyToAccount(key);
    this.publicClient = createPublicClient({ chain: sepolia, transport: http(rpc), cacheTime: 0 });
    this.wallet = createWalletClient({ account: this.account, chain: sepolia, transport: http(rpc) });
  }
  async write(address: Hex, abi: Abi, functionName: string, args: readonly unknown[]) {
    // Different accounts share ENS signers. Confirm each write before reusing its nonce.
    const key = this.account.address.toLowerCase();
    const previous = signerLocks.get(key) ?? Promise.resolve();
    let release = () => {};
    const tail = new Promise<void>(resolve => { release = resolve; });
    signerLocks.set(key, tail);
    await previous;
    try { return await this.writeAndConfirm(address, abi, functionName, args); }
    finally {
      release();
      if (signerLocks.get(key) === tail) signerLocks.delete(key);
    }
  }
  private async writeAndConfirm(address: Hex, abi: Abi, functionName: string, args: readonly unknown[]) {
    if (await this.publicClient.getChainId() !== sepolia.id) throw new Error("ENS requires Sepolia, never Base.");
    const { request } = await this.publicClient.simulateContract({ account: this.account, address, abi, functionName, args });
    const hash = await this.wallet.writeContract(request);
    console.info(`ENS ${functionName}: https://sepolia.etherscan.io/tx/${hash}`);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`ENS ${functionName} reverted: ${hash}`);
    return receipt;
  }
}
