import { randomUUID } from "node:crypto";
import { PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import { x402Client } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import {
  createPublicClient,
  decodeEventLog,
  encodeFunctionData,
  erc20Abi,
  erc4626Abi,
  http,
} from "viem";
import { base } from "viem/chains";
import { confirmedShares } from "./confirmed-shares";
import { pregenerateOwnerWallet } from "./owner-wallet";
import type { WalletPort } from "@/core/ports";
import type { HexAddress, HexHash, X402Quote } from "@/core/types";

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const baseUsdc: HexAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export class PrivyWalletAdapter implements WalletPort {
  private readonly client: PrivyClient;
  private readonly authorizationContext;
  private readonly baseClient;

  constructor(
    appId: string,
    appSecret: string,
    authorizationPrivateKey: string,
    private readonly policyId: string,
    baseRpcUrl: string,
    private readonly sessionSignerId?: string,
  ) {
    this.client = new PrivyClient({ appId, appSecret });
    this.baseClient = createPublicClient({ chain: base, transport: http(baseRpcUrl, { retryCount: 3, retryDelay: 1000 }) });
    this.authorizationContext = {
      authorization_private_keys: [authorizationPrivateKey],
    };
  }

  async createWallet() {
    const wallet = await this.client.wallets().create({
      chain_type: "ethereum",
      policy_ids: [this.policyId],
      external_id: `unflat_${randomUUID().replaceAll("-", "").slice(0, 28)}`,
      idempotency_key: randomUUID(),
    });
    return { walletId: wallet.id, address: wallet.address as HexAddress };
  }

  async createOwnerWallet(input: Parameters<WalletPort["createOwnerWallet"]>[0]) {
    return pregenerateOwnerWallet(this.client, this.sessionSignerId, input);
  }

  async redeemDirectVault(input: Parameters<WalletPort["redeemDirectVault"]>[0]) {
    const data = encodeFunctionData({ abi: erc4626Abi, functionName: "redeem", args: [BigInt(input.sharesRaw), input.walletAddress, input.walletAddress] });
    const sent = await this.client.wallets().ethereum().sendTransaction(input.walletId, {
      caip2: "eip155:8453", params: { transaction: { to: input.vaultAddress, data, value: "0x0", chain_id: 8453 } },
      idempotency_key: input.idempotencyKey, authorization_context: this.authorizationContext,
    });
    if (sent.caip2 !== "eip155:8453" || !/^0x[0-9a-fA-F]{64}$/.test(sent.hash)) throw new Error("Invalid Base recall response.");
    const transactionHash = sent.hash as HexHash;
    const receipt = await this.baseClient.waitForTransactionReceipt({ hash: transactionHash, timeout: 55_000 });
    if (receipt.status !== "success") throw new Error(`Recall reverted: ${transactionHash}`);
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== input.vaultAddress.toLowerCase()) continue;
      try {
        const event = decodeEventLog({ abi: erc4626Abi, data: log.data, topics: log.topics });
        if (event.eventName === "Withdraw" && event.args.sender.toLowerCase() === input.walletAddress.toLowerCase()
          && event.args.owner.toLowerCase() === input.walletAddress.toLowerCase() && event.args.receiver.toLowerCase() === input.walletAddress.toLowerCase()
          && event.args.shares === BigInt(input.sharesRaw)) {
          return { transactionHash, explorerUrl: `https://basescan.org/tx/${transactionHash}`,
            assetsReceivedRaw: event.args.assets.toString(), sharesRedeemedRaw: event.args.shares.toString() };
        }
      } catch { /* Ignore unrelated logs. */ }
    }
    throw new Error(`Confirmed ${transactionHash}, but expected Withdraw receipt evidence is missing. Inspect before retrying.`);
  }

  async verifyPrivyEarnVault(configuredVault: { id: string; address: HexAddress }) {
    const vault = await this.client.wallets().earn().ethereum().vaultDetails(configuredVault.id);
    if (
      vault.id !== configuredVault.id ||
      vault.vault_address.toLowerCase() !== configuredVault.address.toLowerCase() ||
      vault.caip2 !== "eip155:8453" ||
      vault.asset.address.toLowerCase() !== baseUsdc.toLowerCase()
    ) {
      throw new Error("Privy Earn vault details did not match the configured Base USDC allowlist entry.");
    }
  }

  async signX402(walletId: string, quote: X402Quote) {
    if (!quote.paymentRequired) throw new Error("x402 quote is missing PAYMENT-REQUIRED data.");
    const wallet = await this.client.wallets().get(walletId);
    const signer = createViemAccount(this.client, {
      walletId,
      address: wallet.address as HexAddress,
      authorizationContext: this.authorizationContext,
    });
    const client = new x402Client();
    registerExactEvmScheme(client, { signer });
    const payload = await client.createPaymentPayload(quote.paymentRequired as PaymentRequired);
    return { quote, signature: encodePaymentSignatureHeader(payload) };
  }

  async transferUsdc(input: {
    walletId: string;
    recipient: HexAddress;
    amountUsdcCents: number;
    idempotencyKey: string;
  }) {
    const rawAmount = BigInt(input.amountUsdcCents) * 10_000n;
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [input.recipient, rawAmount],
    });
    const sent = await this.client.wallets().ethereum().sendTransaction(input.walletId, {
      caip2: "eip155:8453",
      params: { transaction: { to: baseUsdc, data, value: "0x0", chain_id: 8453 } },
      idempotency_key: input.idempotencyKey,
      authorization_context: this.authorizationContext,
    });
    if (sent.caip2 !== "eip155:8453" || !/^0x[0-9a-fA-F]{64}$/.test(sent.hash)) {
      throw new Error("Privy returned an invalid Base transaction response for the USDC transfer.");
    }
    const transactionHash = sent.hash as HexHash;
    const receipt = await this.baseClient.waitForTransactionReceipt({
      hash: transactionHash,
      timeout: 55_000,
    });
    if (receipt.status !== "success") throw new Error(`Base USDC transfer ${transactionHash} reverted.`);
    const transferMatched = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== baseUsdc.toLowerCase()) return false;
      try {
        const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
        return decoded.eventName === "Transfer"
          && decoded.args.from.toLowerCase() === receipt.from.toLowerCase()
          && decoded.args.to.toLowerCase() === input.recipient.toLowerCase()
          && decoded.args.value === rawAmount;
      } catch {
        return false;
      }
    });
    if (!transferMatched) throw new Error(`Base transaction ${transactionHash} did not emit the confirmed USDC transfer.`);
    return {
      transactionHash,
      network: "eip155:8453" as const,
      source: "privy-live" as const,
      explorerUrl: `https://basescan.org/tx/${transactionHash}`,
    };
  }

  async depositEarn(input: {
    walletId: string;
    vaultId: string;
    vaultAddress: HexAddress;
    amountUsdcCents: number;
    idempotencyKey: string;
  }) {
    const result = await this.client.wallets().earn().ethereum().deposit(input.walletId, {
      vault_id: input.vaultId,
      amount: (input.amountUsdcCents / 100).toFixed(2),
      idempotency_key: input.idempotencyKey,
      authorization_context: this.authorizationContext,
    });
    if (
      result.type !== "earn_deposit"
      || result.wallet_id !== input.walletId
      || result.vault_id !== input.vaultId
      || result.vault_address.toLowerCase() !== input.vaultAddress.toLowerCase()
      || result.asset_address.toLowerCase() !== baseUsdc.toLowerCase()
      || result.raw_amount !== String(BigInt(input.amountUsdcCents) * 10_000n)
      || result.caip2 !== "eip155:8453"
    ) {
      throw new Error("Privy Earn accepted an action that did not match the allowlisted vault, wallet, amount, asset, and Base network.");
    }
    const deadline = Date.now() + 55_000;
    let action = await this.client.wallets().actions.get(result.id, {
      wallet_id: input.walletId,
      include: "steps",
    });
    while (action.status === "pending" && Date.now() < deadline) {
      await wait(1_000);
      action = await this.client.wallets().actions.get(result.id, {
        wallet_id: input.walletId,
        include: "steps",
      });
    }
    if (action.status !== "succeeded") {
      const detail = action.status === "pending"
        ? "timed out while still pending"
        : JSON.stringify(action.failure_reason ?? "no failure reason returned");
      throw new Error(`Privy Earn action ${result.id} ${detail}. Inspect the action before retrying.`);
    }
    if (action.type !== "earn_deposit") throw new Error(`Privy returned unexpected wallet action type ${action.type}.`);
    if (
      action.wallet_id !== input.walletId
      || action.vault_id !== input.vaultId
      || action.vault_address.toLowerCase() !== input.vaultAddress.toLowerCase()
      || action.asset_address.toLowerCase() !== baseUsdc.toLowerCase()
      || action.raw_amount !== String(BigInt(input.amountUsdcCents) * 10_000n)
      || action.caip2 !== "eip155:8453"
    ) {
      throw new Error("Completed Privy Earn action did not match the requested wallet, vault, amount, and Base network.");
    }
    const hashes = new Set<HexHash>();
    for (const step of action.steps ?? []) {
      if (step.type === "evm_transaction") {
        if (step.caip2 !== "eip155:8453") throw new Error(`Privy Earn used unexpected network ${step.caip2}.`);
        if (step.transaction_hash && /^0x[0-9a-fA-F]{64}$/.test(step.transaction_hash)) {
          hashes.add(step.transaction_hash as HexHash);
        }
      }
      if (step.type === "evm_user_operation") {
        if (step.caip2 !== "eip155:8453") throw new Error(`Privy Earn used unexpected network ${step.caip2}.`);
        if (step.bundle_transaction_hash && /^0x[0-9a-fA-F]{64}$/.test(step.bundle_transaction_hash)) {
          hashes.add(step.bundle_transaction_hash as HexHash);
        }
      }
    }
    if (hashes.size === 0) throw new Error(`Privy Earn action ${result.id} succeeded without a Base transaction hash.`);
    return {
      mode: "privy-earn" as const,
      actionId: result.id,
      status: "succeeded" as const,
      transactionHashes: [...hashes],
    };
  }

  async approveUsdc(input: {
    walletId: string;
    walletAddress: HexAddress;
    spender: HexAddress;
    amountUsdcCents: number;
    idempotencyKey: string;
  }) {
    const rawAmount = BigInt(input.amountUsdcCents) * 10_000n;
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [input.spender, rawAmount],
    });
    const sent = await this.client.wallets().ethereum().sendTransaction(input.walletId, {
      caip2: "eip155:8453",
      params: { transaction: { to: baseUsdc, data, value: "0x0", chain_id: 8453 } },
      idempotency_key: input.idempotencyKey,
      authorization_context: this.authorizationContext,
    });
    if (sent.caip2 !== "eip155:8453" || !/^0x[0-9a-fA-F]{64}$/.test(sent.hash)) {
      throw new Error("Privy returned an invalid Base transaction response for the USDC approval.");
    }
    const transactionHash = sent.hash as HexHash;
    const receipt = await this.baseClient.waitForTransactionReceipt({ hash: transactionHash, timeout: 55_000 });
    if (receipt.status !== "success") throw new Error(`Base USDC approval ${transactionHash} reverted.`);
    const approvalMatched = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== baseUsdc.toLowerCase()) return false;
      try {
        const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
        return decoded.eventName === "Approval"
          && decoded.args.owner.toLowerCase() === input.walletAddress.toLowerCase()
          && decoded.args.spender.toLowerCase() === input.spender.toLowerCase()
          && decoded.args.value === rawAmount;
      } catch {
        return false;
      }
    });
    if (!approvalMatched) throw new Error(`Base transaction ${transactionHash} did not emit the exact USDC approval.`);
    return { transactionHash, explorerUrl: `https://basescan.org/tx/${transactionHash}` };
  }

  async depositDirectVault(input: {
    walletId: string;
    walletAddress: HexAddress;
    vaultAddress: HexAddress;
    amountUsdcCents: number;
    idempotencyKey: string;
  }) {
    const rawAmount = BigInt(input.amountUsdcCents) * 10_000n;
    const data = encodeFunctionData({
      abi: erc4626Abi,
      functionName: "deposit",
      args: [rawAmount, input.walletAddress],
    });
    const sent = await this.client.wallets().ethereum().sendTransaction(input.walletId, {
      caip2: "eip155:8453",
      params: { transaction: { to: input.vaultAddress, data, value: "0x0", chain_id: 8453 } },
      idempotency_key: input.idempotencyKey,
      authorization_context: this.authorizationContext,
    });
    if (sent.caip2 !== "eip155:8453" || !/^0x[0-9a-fA-F]{64}$/.test(sent.hash)) {
      throw new Error("Privy returned an invalid Base transaction response for the direct Morpho deposit.");
    }
    const transactionHash = sent.hash as HexHash;
    const receipt = await this.baseClient.waitForTransactionReceipt({ hash: transactionHash, timeout: 55_000 });
    if (receipt.status !== "success") throw new Error(`Direct Morpho deposit ${transactionHash} reverted.`);
    let sharesReceived: bigint | undefined;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== input.vaultAddress.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: erc4626Abi, data: log.data, topics: log.topics });
        if (
          decoded.eventName === "Deposit"
          && decoded.args.sender.toLowerCase() === input.walletAddress.toLowerCase()
          && decoded.args.receiver.toLowerCase() === input.walletAddress.toLowerCase()
          && decoded.args.assets === rawAmount
          && decoded.args.shares > 0n
        ) {
          sharesReceived = decoded.args.shares;
          break;
        }
      } catch {
        // Other vault events are unrelated to the deposit proof.
      }
    }
    if (sharesReceived === undefined) {
      throw new Error(`Base transaction ${transactionHash} did not emit the expected ERC-4626 Deposit event.`);
    }
    const shares = await confirmedShares(sharesReceived, () => this.baseClient.readContract({
      address: input.vaultAddress,
      abi: erc20Abi,
      functionName: "decimals",
    }));
    return {
      transactionHash,
      explorerUrl: `https://basescan.org/tx/${transactionHash}`,
      ...shares,
    };
  }
}
