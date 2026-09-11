import { randomUUID } from "node:crypto";
import { PrivyClient } from "@privy-io/node";
import { createViemAccount } from "@privy-io/node/viem";
import { x402Client } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import type { WalletPort } from "@/core/ports";
import type { HexAddress, X402Quote } from "@/core/types";

export class PrivyWalletAdapter implements WalletPort {
  private readonly client: PrivyClient;
  private readonly authorizationContext;

  constructor(
    appId: string,
    appSecret: string,
    authorizationPrivateKey: string,
    private readonly policyId: string,
  ) {
    this.client = new PrivyClient({ appId, appSecret });
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

  async depositEarn(input: {
    walletId: string;
    vaultId: string;
    amountUsdcCents: number;
    idempotencyKey: string;
  }) {
    const result = await this.client.wallets().earn().ethereum().deposit(input.walletId, {
      vault_id: input.vaultId,
      amount: (input.amountUsdcCents / 100).toFixed(2),
      idempotency_key: input.idempotencyKey,
      authorization_context: this.authorizationContext,
    });
    return { actionId: result.id, status: result.status };
  }
}
