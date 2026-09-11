import { createPublicClient, erc20Abi, http, parseAbi } from "viem";
import { base } from "viem/chains";
import type { PreflightPort } from "@/core/ports";

const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const vaultAbi = parseAbi(["function deposit(uint256 assets, address receiver) returns (uint256 shares)"]);

export class BaseEarnPreflightAdapter implements PreflightPort {
  private readonly client;

  constructor(rpcUrl: string) {
    this.client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  }

  async verifyEarn(input: Parameters<PreflightPort["verifyEarn"]>[0]) {
    const rawAmount = BigInt(input.amountUsdcCents) * 10_000n;
    try {
      const [allowance, gas] = await Promise.all([
        this.client.readContract({
          address: usdc,
          abi: erc20Abi,
          functionName: "allowance",
          args: [input.walletAddress, input.vaultAddress],
        }),
        this.client.estimateContractGas({
          address: input.vaultAddress,
          abi: vaultAbi,
          functionName: "deposit",
          args: [rawAmount, input.walletAddress],
          account: input.walletAddress,
        }),
      ]);
      const allowanceOk = allowance >= rawAmount;
      return {
        allPassed: allowanceOk,
        allowanceOk,
        gasEstimate: gas.toString(),
        reason: allowanceOk
          ? "eth_estimateGas and USDC allowance checks passed independently."
          : "USDC allowance to the allowlisted vault is below the deposit amount.",
      };
    } catch (error) {
      return {
        allPassed: false,
        allowanceOk: false,
        gasEstimate: "0",
        reason: error instanceof Error ? error.message : "Base preflight failed.",
      };
    }
  }
}

