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
    this.client = createPublicClient({ chain: base, transport: http(rpcUrl, { retryCount: 3, retryDelay: 1000 }) });
  }

  async verifyRecall(input: Parameters<PreflightPort["verifyRecall"]>[0]) {
    try {
      const shares = BigInt(input.sharesRaw);
      const [asset, balance, simulation, gas] = await Promise.all([
        this.client.readContract({ address: input.vaultAddress, abi: erc4626Abi, functionName: "asset" }),
        this.client.readContract({ address: input.vaultAddress, abi: erc20Abi, functionName: "balanceOf", args: [input.walletAddress] }),
        this.client.simulateContract({ address: input.vaultAddress, abi: erc4626Abi, functionName: "redeem", args: [shares, input.walletAddress, input.walletAddress], account: input.walletAddress }),
        this.client.estimateContractGas({ address: input.vaultAddress, abi: erc4626Abi, functionName: "redeem", args: [shares, input.walletAddress, input.walletAddress], account: input.walletAddress }),
      ]);
      const allPassed = asset.toLowerCase() === usdc.toLowerCase() && shares > 0n && balance >= shares && simulation.result > 0n && gas > 0n;
      return { allPassed, reason: allPassed ? "Canonical Base USDC, sufficient shares, redeem eth_call and gas checks passed." : "Recall asset, shares or simulation checks failed.", assetsRaw: simulation.result.toString() };
    } catch { return { allPassed: false, reason: "Recall preflight failed. Inspect vault liquidity, shares and gas balance; nothing was signed." }; }
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
    let context = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!input.approvalTransactionHash) {
          return { allPassed: false, reason: "Confirmed approval transaction proof required before deposit simulation." };
        }
        const receipt = await this.client.waitForTransactionReceipt({ hash: input.approvalTransactionHash, timeout: 15_000 });
        if (receipt.status !== "success") return { allPassed: false, reason: "USDC approval receipt reverted." };
        const blockNumber = await this.client.getBlockNumber({ cacheTime: 0 });
        context = `Approval block ${receipt.blockNumber}; simulation block ${blockNumber}; checked ${new Date().toISOString()}; attempt ${attempt + 1}.`;
        // Receipt availability and "latest" state can disagree during Base preconfirmation.
        if (blockNumber < receipt.blockNumber) throw new Error("APPROVAL_STATE_NOT_READY: RPC head is behind the approval receipt.");
        const allowance = await this.client.readContract({
          address: usdc, abi: erc20Abi, functionName: "allowance",
          args: [input.walletAddress, input.vaultAddress], blockNumber,
        });
        context += ` Allowance ${allowance} raw USDC.`;
        if (allowance < rawAmount) throw new Error("APPROVAL_STATE_NOT_READY: allowance is not visible at the simulation block.");
        const simulation = await this.client.simulateContract({
          address: input.vaultAddress,
          abi: [...erc4626Abi, ...parseAbi(["error TransferFromReverted()"])],
          functionName: "deposit",
          args: [rawAmount, input.walletAddress],
          account: input.walletAddress,
          blockNumber,
        });
        if (simulation.result <= 0n) return { allPassed: false, reason: `Deposit eth_call returned zero shares. ${context}` };
        return {
          allPassed: true,
          reason: `Deposit eth_call succeeded and previewed ${simulation.result} raw vault shares. ${context}`,
          simulatedSharesRaw: simulation.result.toString(),
        };
      } catch (error) {
        const reason = error && typeof error === "object" && "shortMessage" in error
          ? String(error.shortMessage) : error instanceof Error ? error.message : "Deposit eth_call failed.";
        const approvalStateRace = /APPROVAL_STATE_NOT_READY|0xe65b7a77|TransferFromReverted/.test(reason);
        if (attempt === 0 && approvalStateRace) {
          await new Promise(resolve => setTimeout(resolve, 2_000));
          continue;
        }
        return { allPassed: false, reason: `${reason} ${context}` };
      }
    }
    return { allPassed: false, reason: "Deposit simulation retry exhausted." };
  }
}
