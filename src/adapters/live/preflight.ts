import { createPublicClient, erc20Abi, erc4626Abi, getAbiItem, http, parseAbi } from "viem";
import { base } from "viem/chains";
import type { PreflightPort } from "@/core/ports";
import type { HexAddress } from "@/core/types";

const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const vaultAbi = parseAbi([
  "function asset() view returns (address)",
]);

export function evaluateEarnReadiness(input: {
  assetAddress: HexAddress;
  balance: bigint;
  rawAmount: bigint;
}) {
  const assetMatches = input.assetAddress.toLowerCase() === usdc.toLowerCase();
  const funded = input.balance >= input.rawAmount;
  return {
    allPassed: assetMatches && funded,
    reason: assetMatches && funded
      ? "Allowlisted vault uses canonical Base USDC and the wallet balance covers the deposit."
      : [
          !assetMatches ? `vault asset ${input.assetAddress} is not canonical Base USDC ${usdc}` : undefined,
          !funded ? `wallet balance ${input.balance} is below required ${input.rawAmount}` : undefined,
        ].filter(Boolean).join("; "),
  };
}

export class BaseEarnPreflightAdapter implements PreflightPort {
  private readonly client;

  constructor(rpcUrl: string) {
    this.client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  }

  async getUsdcBalance(walletAddress: Parameters<PreflightPort["getUsdcBalance"]>[0]) {
    const rawAmount = await this.client.readContract({
      address: usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress],
    });
    return {
      rawAmount: rawAmount.toString(),
      amountUsdcCents: Number(rawAmount / 10_000n),
    };
  }

  async verifyUsdcTransfer(input: Parameters<PreflightPort["verifyUsdcTransfer"]>[0]) {
    const rawAmount = BigInt(input.amountUsdcCents) * 10_000n;
    try {
      const [balance, gas] = await Promise.all([
        this.client.readContract({
          address: usdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [input.walletAddress],
        }),
        this.client.estimateContractGas({
          address: usdc,
          abi: erc20Abi,
          functionName: "transfer",
          args: [input.recipient, rawAmount],
          account: input.walletAddress,
        }),
      ]);
      const allPassed = balance >= rawAmount && gas > 0n;
      return {
        allPassed,
        gasEstimate: gas.toString(),
        reason: allPassed
          ? "Base USDC balance and eth_estimateGas checks passed independently."
          : "Base USDC balance is below the transfer amount.",
      };
    } catch (error) {
      return {
        allPassed: false,
        gasEstimate: "0",
        reason: error instanceof Error ? error.message : "Base USDC transfer preflight failed.",
      };
    }
  }

  async verifyEarn(input: Parameters<PreflightPort["verifyEarn"]>[0]) {
    const rawAmount = BigInt(input.amountUsdcCents) * 10_000n;
    try {
      const [balance, assetAddress, allowance] = await Promise.all([
        this.client.readContract({
          address: usdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [input.walletAddress],
        }),
        this.client.readContract({
          address: input.vaultAddress,
          abi: vaultAbi,
          functionName: "asset",
        }),
        input.execution === "direct-morpho"
          ? this.client.readContract({
              address: usdc,
              abi: erc20Abi,
              functionName: "allowance",
              args: [input.walletAddress, input.vaultAddress],
            })
          : Promise.resolve(0n),
      ]);
      const readiness = evaluateEarnReadiness({ assetAddress, balance, rawAmount });
      let approvalTransactionHash: `0x${string}` | undefined;
      if (input.execution === "direct-morpho" && allowance === rawAmount) {
        try {
          const latestBlock = await this.client.getBlockNumber();
          const logs = await this.client.getLogs({
            address: usdc,
            event: getAbiItem({ abi: erc20Abi, name: "Approval" }),
            args: { owner: input.walletAddress, spender: input.vaultAddress },
            fromBlock: latestBlock > 1_900n ? latestBlock - 1_900n : 0n,
            toBlock: latestBlock,
          });
          approvalTransactionHash = logs.findLast((log) => log.args.value === rawAmount)?.transactionHash;
        } catch {
          // A missing log proof causes a fresh exact approval; it never bypasses one.
        }
      }
      return {
        ...readiness,
        assetAddress,
        balanceRawAmount: balance.toString(),
        allowanceRawAmount: allowance.toString(),
        approvalTransactionHash,
        execution: input.execution,
      };
    } catch (error) {
      return {
        allPassed: false,
        execution: input.execution,
        reason: error instanceof Error ? error.message : "Base preflight failed.",
      };
    }
  }

  async simulateDirectDeposit(input: Parameters<PreflightPort["simulateDirectDeposit"]>[0]) {
    const rawAmount = BigInt(input.amountUsdcCents) * 10_000n;
    try {
      const simulation = await this.client.simulateContract({
        address: input.vaultAddress,
        abi: erc4626Abi,
        functionName: "deposit",
        args: [rawAmount, input.walletAddress],
        account: input.walletAddress,
      });
      if (simulation.result <= 0n) {
        return { allPassed: false, reason: "ERC-4626 deposit eth_call returned zero shares." };
      }
      return {
        allPassed: true,
        reason: `ERC-4626 deposit eth_call succeeded and previewed ${simulation.result} raw vault shares.`,
        simulatedSharesRaw: simulation.result.toString(),
      };
    } catch (error) {
      return {
        allPassed: false,
        reason: error instanceof Error ? error.message : "ERC-4626 deposit eth_call failed.",
      };
    }
  }
}
