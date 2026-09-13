import { createPublicClient, erc20Abi, http } from "viem";
import { base, avalancheFuji } from "viem/chains";
import { accountChain, chainConfig, usdcAtomic, type AccountChain } from "@/core/chains";
import type { PreflightPort } from "@/core/ports";
import type { HexAddress } from "@/core/types";

export function paymentClient(chain: AccountChain, rpcUrl: string) {
  return createPublicClient({ chain: chain === "base" ? base : avalancheFuji,
    transport: http(rpcUrl, { retryCount: 3, retryDelay: 1000 }) });
}

export class UsdcTransferPreflight {
  private readonly clients;
  constructor(baseRpc: string, fujiRpc: string = chainConfig("avalanche-fuji").rpcUrl) {
    this.clients = { base: paymentClient("base", baseRpc), "avalanche-fuji": paymentClient("avalanche-fuji", fujiRpc) };
  }
  private async token(chain?: AccountChain) {
    const config = chainConfig(chain), client = this.clients[accountChain(chain)];
    const [id, decimals] = await Promise.all([client.getChainId(), client.readContract({ address: config.usdc, abi: erc20Abi, functionName: "decimals" })]);
    if (id !== config.id) throw new Error(`RPC chain mismatch: expected ${config.id}, received ${id}.`);
    if (decimals !== 6) throw new Error(`Unexpected ${config.label} USDC decimals: ${decimals}. Nothing was signed.`);
    return { config, client, decimals };
  }
  async getUsdcBalance(address: HexAddress, chain?: AccountChain) {
    const { config, client, decimals } = await this.token(chain);
    const raw = await client.readContract({ address: config.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] });
    const cents = raw / 10n ** BigInt(decimals - 2);
    if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Balance exceeds safe accounting range.");
    return { rawAmount: raw.toString(), amountUsdcCents: Number(cents) };
  }
  async verify(input: Parameters<PreflightPort["verifyUsdcTransfer"]>[0]) {
    try {
      const { config, client, decimals } = await this.token(input.chain);
      const raw = usdcAtomic(input.amountUsdcCents, decimals);
      const [balance, native, gas, fees] = await Promise.all([
        client.readContract({ address: config.usdc, abi: erc20Abi, functionName: "balanceOf", args: [input.walletAddress] }),
        client.getBalance({ address: input.walletAddress }),
        client.estimateContractGas({ address: config.usdc, abi: erc20Abi, functionName: "transfer", args: [input.recipient, raw], account: input.walletAddress }),
        client.estimateFeesPerGas(),
      ]);
      const gasLimit = (gas * 120n + 99n) / 100n;
      const gasPrice = fees.maxFeePerGas;
      const fundedGas = gas > 0n && gasPrice > 0n && native >= gasLimit * gasPrice;
      const allPassed = balance >= raw && fundedGas;
      return { allPassed, gasEstimate: gas.toString(), reason: allPassed
        ? `${config.label}: Circle USDC balance, decimals, eth_estimateGas and ${config.gasSymbol} gas balance passed independently. No allowance is needed for transfer().`
        : balance < raw ? `${config.label} USDC balance is below the transfer amount.` : `Insufficient ${config.gasSymbol} for estimated gas plus a 20% gas-unit margin on ${config.label}.` };
    } catch (error) {
      return { allPassed: false, gasEstimate: "0", reason: error instanceof Error ? error.message : "Independent USDC transfer preflight failed." };
    }
  }
}
