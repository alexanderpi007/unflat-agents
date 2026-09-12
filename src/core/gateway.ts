import { createHash, randomUUID } from "node:crypto";
import { IdempotencyError, RefusalError } from "./errors";
import { MandateService } from "./mandates";
import { createMandateCommitment } from "./mandate-commitment";
import type { Dependencies } from "./ports";
import { encryptStatement } from "./statement";
import { aimorganFeeWaivedLabel, directMorphoLabel } from "./labels";
import type {
  ActionKind,
  Agent,
  Mandate,
  MandateDecision,
  PriceValidation,
  StatementEvent,
  Strategy,
  X402Quote,
  X402QuoteConfirmation,
} from "./types";

const allActions: ActionKind[] = ["usdc.transfer", "x402.pay", "aimorgan.strategize", "earn.sweep"];

export class SigningGateway {
  private readonly mandates: MandateService;

  constructor(private readonly deps: Dependencies) {
    if (deps.vaultAllowlist.length === 0) throw new Error("At least one unflat vault must be allowlisted.");
    this.mandates = new MandateService(deps.store, deps.clock, deps.arkiv);
  }

  async createAgent(displayName: string): Promise<Agent> {
    return this.provisionAgent(randomUUID(), displayName);
  }

  async setupIdentityNamespace<T>(admin: { setup(): Promise<T> }): Promise<T> {
    return admin.setup();
  }

  async getOrCreateAgent(agentId: string, displayName: string, ownerId?: string): Promise<{ agent: Agent; reused: boolean }> {
    const existing = await this.deps.store.getAgent(agentId);
    if (existing) return { agent: await this.ensureAgentIdentity(agentId), reused: true };
    return { agent: await this.provisionAgent(agentId, displayName, ownerId), reused: false };
  }

  private async provisionAgent(agentId: string, displayName: string, ownerId = "owner:demo"): Promise<Agent> {
    const label = displayName
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36);
    if (!label) throw new Error("Agent name must contain a letter or number.");

    const wallet = await this.deps.wallet.createWallet();
    const agent: Agent = {
      id: agentId,
      ownerId,
      displayName,
      ensName: `${label}.agents.unflat.eth`,
      walletId: wallet.walletId,
      walletAddress: wallet.address,
      createdAt: this.deps.clock.now().toISOString(),
    };
    await this.deps.store.putAgent(agent);
    const registered = await this.ensureAgentIdentity(agent.id);
    await this.event(agent.id, "agent.create", "completed", 0, `Agent created as ${registered.ensName}.`,
      registered.ensRegistrationTransaction ? `https://sepolia.etherscan.io/tx/${registered.ensRegistrationTransaction}` : `ensv2:mock:${registered.ensName}`);
    return registered;
  }

  async ensureAgentIdentity(agentId: string, ownerId?: string): Promise<Agent> {
    const agent = await this.deps.store.getAgent(agentId);
    if (!agent) throw new Error("Agent not found.");
    const label = agent.displayName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 36);
    const identity = await this.deps.ens.createIdentity(label, agent.walletAddress, ownerId ?? agent.ownerId ?? "owner:demo");
    const updated = { ...agent, ensName: identity.name };
    if (/^0x[0-9a-f]{64}$/i.test(identity.reference)) {
      updated.ensRegistrationTransaction = identity.reference;
      await this.event(agent.id, "ens.register", "completed", 0, `Registered ${identity.name} on ENSv2 Sepolia.`, `https://sepolia.etherscan.io/tx/${identity.reference}`);
    }
    await this.deps.store.putAgent(updated);
    return updated;
  }

  async previewStrategize(input: { agentId: string; totalUsdcCents: number }) {
    const agent = await this.requireAgent(input.agentId);
    const dryStrategy = await this.deps.aiMorgan.strategize({
      agentAddress: agent.walletAddress,
      totalUsdcCents: input.totalUsdcCents,
      dry: true,
    });
    await this.requirePriceValidation(input.agentId, "aimorgan.strategize", dryStrategy.priceValidation);
    if (!this.deps.aiMorganX402) {
      return { mode: "waived" as const, dryStrategy, feeUsdcCents: 0 };
    }
    const quote = await this.deps.x402.quote("https://aimorgan.net/api/strategize", {
      method: "POST",
      body: this.strategizeBody(agent.walletAddress, input.totalUsdcCents),
    });
    await this.requireDeclaredPriceMatch(input.agentId, quote, dryStrategy.priceValidation);
    return { mode: "x402" as const, dryStrategy, quote, quoteValidation: dryStrategy.priceValidation! };
  }

  async usdcBalance(agentId: string) {
    const agent = await this.requireAgent(agentId);
    return this.deps.preflight.getUsdcBalance(agent.walletAddress);
  }

  async previewVaultDeposit(input: { agentId: string; amountUsdcCents: number }) {
    const agent = await this.requireAgent(input.agentId);
    const vault = this.selectedVault();
    if (vault.execution === "privy-earn-api") await this.deps.wallet.verifyPrivyEarnVault(vault);
    const preflight = await this.deps.preflight.verifyEarn({
      walletAddress: agent.walletAddress,
      vaultAddress: vault.address,
      amountUsdcCents: input.amountUsdcCents,
      execution: vault.execution,
    });
    const rawAmount = String(BigInt(input.amountUsdcCents) * 10_000n);
    return {
      vault,
      preflight,
      approvalRequired: vault.execution === "direct-morpho"
        && !(preflight.allowanceRawAmount === rawAmount && preflight.approvalTransactionHash),
    };
  }

  async grantMandate(input: {
    agentId: string;
    ownerId: string;
    durationSeconds: number;
    maxPerActionUsdcCents: number;
    maxTotalUsdcCents: number;
    allowedActions?: ActionKind[];
  }): Promise<Mandate> {
    const agent = await this.requireAgent(input.agentId);
    if (input.durationSeconds <= 0) throw new Error("Mandate duration must be positive.");
    if (input.maxPerActionUsdcCents <= 0 || input.maxTotalUsdcCents <= 0) {
      throw new Error("Mandate limits must be positive.");
    }

    const now = this.deps.clock.now();
    const existing = await this.deps.arkiv.findValidMandates(input.agentId);
    if (existing.found) {
      throw new Error(
        `Arkiv already contains a live mandate for this agent at block ${existing.blockNumber}; wait for its TTL to expire.`,
      );
    }
    const mandate: Mandate = {
      id: randomUUID(),
      agentId: input.agentId,
      ownerId: input.ownerId,
      allowedActions: input.allowedActions ?? allActions,
      maxPerActionUsdcCents: input.maxPerActionUsdcCents,
      maxTotalUsdcCents: input.maxTotalUsdcCents,
      spentUsdcCents: 0,
      startsAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + input.durationSeconds * 1_000).toISOString(),
      createdAt: now.toISOString(),
    };

    const opening = createMandateCommitment({
      mandateId: mandate.id,
      agentId: mandate.agentId,
      maxTotalUsdcCents: mandate.maxTotalUsdcCents,
      maxPerActionUsdcCents: mandate.maxPerActionUsdcCents,
    });
    const arkiv = await this.deps.arkiv.publishMandate({
      agentId: mandate.agentId,
      expiry: mandate.expiresAt,
      commitment: opening.commitment,
      durationSeconds: input.durationSeconds,
    });
    const published: Mandate = {
      ...mandate,
      arkivEntityKey: arkiv.entityKey,
      arkivTransactionHash: arkiv.transactionHash,
      arkivExplorerUrl: arkiv.explorerUrl,
      arkivExpiresAtBlock: arkiv.expiresAtBlock,
      arkivCommitment: arkiv.commitment,
    };
    await this.deps.store.putMandateOpening(opening);
    const identityUpdate = await this.deps.ens.setMandateCommitment(agent.ensName, arkiv.commitment, input.ownerId);
    if (identityUpdate.detail) await this.event(agent.id, "ens.readonly", "completed", 0, identityUpdate.detail);
    if (identityUpdate.reference) await this.event(agent.id, "ens.records", "completed", 0,
      "ENS mandate.commitment updated to the published Arkiv commitment; owner record updated.",
      `https://sepolia.etherscan.io/tx/${identityUpdate.reference}`);
    await this.deps.store.putMandate(published);
    await this.event(
      input.agentId,
      "mandate.grant",
      "completed",
      0,
      `Mandate granted as Arkiv entity ${arkiv.entityKey}, expiring at block ${arkiv.expiresAtBlock}; expiry is automatic and no revocation transaction exists. ${arkiv.explorerUrl}`,
      arkiv.explorerUrl,
    );
    return published;
  }

  async payX402(input: { agentId: string; resource: string; idempotencyKey: string }) {
    return this.idempotent(input.agentId, input.idempotencyKey, input, async () => {
      const agent = await this.requireAgent(input.agentId);
      const quote = await this.deps.x402.quote(input.resource);
      const initial = await this.mandates.decide(input.agentId, "x402.pay", quote.amountUsdcCents);
      if (!initial.allowed) return this.refuse(input.agentId, "x402.pay", quote.amountUsdcCents, initial);

      const validation = await this.deps.aiMorgan.validatePrice(quote);
      await this.requirePriceValidation(input.agentId, "x402.pay", validation);

      // Atomic TTL/budget re-check immediately before the only signing-capable call.
      const signingDecision = await this.reserveMandate(
        input.agentId,
        "x402.pay",
        quote.amountUsdcCents,
      );
      if (!signingDecision.allowed) {
        return this.refuse(input.agentId, "x402.pay", quote.amountUsdcCents, signingDecision);
      }
      const signed = await this.deps.wallet.signX402(agent.walletId, quote);
      const settlement = await this.deps.x402.submit(signed);
      await this.event(
        input.agentId,
        "x402.pay",
        "completed",
        quote.amountUsdcCents,
        signingDecision.reason,
        settlement.transactionHash,
      );
      return { quote, settlement, decision: signingDecision };
    });
  }

  async transferUsdc(input: {
    agentId: string;
    recipient: Agent["walletAddress"];
    amountUsdcCents: number;
    idempotencyKey: string;
  }) {
    return this.idempotent(input.agentId, input.idempotencyKey, input, async () => {
      const agent = await this.requireAgent(input.agentId);
      const initial = await this.mandates.decide(input.agentId, "usdc.transfer", input.amountUsdcCents);
      if (!initial.allowed) return this.refuse(input.agentId, "usdc.transfer", input.amountUsdcCents, initial);
      if (!this.deps.demoPaymentRecipient
        || input.recipient.toLowerCase() !== this.deps.demoPaymentRecipient.toLowerCase()) {
        return this.refuse(input.agentId, "usdc.transfer", input.amountUsdcCents, {
          ...initial,
          allowed: false,
          reason: "REFUSED — recipient is not the configured demo payment address; nothing was signed.",
        });
      }

      const validation = await this.deps.aiMorgan.strategize({
        agentAddress: agent.walletAddress,
        totalUsdcCents: input.amountUsdcCents,
        dry: true,
      });
      await this.requirePriceValidation(input.agentId, "usdc.transfer", validation.priceValidation);
      const preflight = await this.deps.preflight.verifyUsdcTransfer({
        walletAddress: agent.walletAddress,
        recipient: input.recipient,
        amountUsdcCents: input.amountUsdcCents,
      });
      if (!preflight.allPassed) {
        return this.refuse(input.agentId, "usdc.transfer", input.amountUsdcCents, {
          ...initial,
          allowed: false,
          reason: `REFUSED — independent Base transfer preflight failed: ${preflight.reason}`,
        });
      }

      const signingDecision = await this.reserveMandate(
        input.agentId,
        "usdc.transfer",
        input.amountUsdcCents,
      );
      if (!signingDecision.allowed) {
        return this.refuse(input.agentId, "usdc.transfer", input.amountUsdcCents, signingDecision);
      }
      const transfer = await this.deps.wallet.transferUsdc({
        walletId: agent.walletId,
        recipient: input.recipient,
        amountUsdcCents: input.amountUsdcCents,
        idempotencyKey: input.idempotencyKey,
      });
      const transferProof = transfer.source === "privy-live"
        ? `Transaction ${transfer.transactionHash}: ${transfer.explorerUrl ?? `https://basescan.org/tx/${transfer.transactionHash}`}`
        : `MOCK SAFETY NET — no transaction was broadcast; simulated reference ${transfer.transactionHash}.`;
      await this.event(
        input.agentId,
        "usdc.transfer",
        "completed",
        input.amountUsdcCents,
        `${signingDecision.reason} AIMorgan priceValidation.allPassed was true and independent Base gas/balance checks passed. ${transferProof}`,
        transfer.transactionHash,
      );
      return { transfer, preflight, decision: signingDecision };
    });
  }

  async strategize(input: {
    agentId: string;
    totalUsdcCents: number;
    idempotencyKey: string;
    confirmedQuote?: X402QuoteConfirmation;
  }): Promise<Strategy> {
    return this.idempotent(input.agentId, input.idempotencyKey, input, async () => {
      const agent = await this.requireAgent(input.agentId);
      const initial = await this.mandates.decide(input.agentId, "aimorgan.strategize", 0);
      if (!initial.allowed) return this.refuse(input.agentId, "aimorgan.strategize", 0, initial);

      // This free dry call is always first. It never uses ?free=true or AIMorgan's MCP.
      const dryStrategy = await this.deps.aiMorgan.strategize({
        agentAddress: agent.walletAddress,
        totalUsdcCents: input.totalUsdcCents,
        dry: true,
      });
      await this.requirePriceValidation(
        input.agentId,
        "aimorgan.strategize",
        dryStrategy.priceValidation,
      );

      if (!this.deps.aiMorganX402) {
        const freeStrategy = await this.deps.aiMorgan.strategize({
          agentAddress: agent.walletAddress,
          totalUsdcCents: input.totalUsdcCents,
          dry: false,
          feeWaived: true,
        });
        await this.requirePriceValidation(
          input.agentId,
          "aimorgan.strategize",
          freeStrategy.priceValidation,
        );
        await this.deps.store.putStrategy(input.agentId, freeStrategy);
        await this.event(
          input.agentId,
          "aimorgan.strategize",
          "completed",
          0,
          `${initial.reason} Dry strategize ran before the free REST call. ${aimorganFeeWaivedLabel}.`,
          freeStrategy.id,
        );
        return freeStrategy;
      }

      const quote = await this.deps.x402.quote("https://aimorgan.net/api/strategize", {
        method: "POST",
        body: this.strategizeBody(agent.walletAddress, input.totalUsdcCents),
      });
      await this.requireDeclaredPriceMatch(input.agentId, quote, dryStrategy.priceValidation);
      if (input.confirmedQuote && !this.quoteMatches(input.confirmedQuote, quote)) {
        const current = await this.mandates.decide(input.agentId, "aimorgan.strategize", quote.amountUsdcCents);
        return this.refuse(input.agentId, "aimorgan.strategize", quote.amountUsdcCents, {
          ...current,
          allowed: false,
          reason: "REFUSED — the live x402 quote changed after confirmation; nothing was signed. Review and confirm the new quote.",
        });
      }

      const signingDecision = await this.reserveMandate(
        input.agentId,
        "aimorgan.strategize",
        quote.amountUsdcCents,
      );
      if (!signingDecision.allowed) {
        return this.refuse(input.agentId, "aimorgan.strategize", quote.amountUsdcCents, signingDecision);
      }
      const payment = await this.deps.wallet.signX402(agent.walletId, quote);
      const paidStrategy = await this.deps.aiMorgan.strategize({
        agentAddress: agent.walletAddress,
        totalUsdcCents: input.totalUsdcCents,
        dry: false,
        payment,
      });
      await this.requirePriceValidation(
        input.agentId,
        "aimorgan.strategize",
        paidStrategy.priceValidation,
      );
      await this.deps.store.putStrategy(input.agentId, paidStrategy);
      await this.event(
        input.agentId,
        "aimorgan.strategize",
        "completed",
        quote.amountUsdcCents,
        `${signingDecision.reason} Dry strategize ran before the paid REST call.`,
        paidStrategy.id,
      );
      return paidStrategy;
    });
  }

  async sweepIdle(input: {
    agentId: string;
    strategyId: string;
    amountUsdcCents: number;
    idempotencyKey: string;
    approvalPolicy?: "reuse-only";
  }) {
    return this.idempotent(input.agentId, input.idempotencyKey, input, async () => {
      const agent = await this.requireAgent(input.agentId);
      const strategy = await this.deps.store.getStrategy(input.agentId, input.strategyId);
      if (!strategy) throw new Error("Validated strategy not found in the gateway store.");
      const initial = await this.mandates.decide(input.agentId, "earn.sweep", input.amountUsdcCents);
      if (!initial.allowed) return this.refuse(input.agentId, "earn.sweep", input.amountUsdcCents, initial);
      await this.requirePriceValidation(input.agentId, "earn.sweep", strategy.priceValidation);

      // AIMorgan's vault picks are advisory. The deposit target comes only from our allowlist.
      const vault = this.selectedVault();
      if (vault.execution === "privy-earn-api") await this.deps.wallet.verifyPrivyEarnVault(vault);
      const preflight = await this.deps.preflight.verifyEarn({
        walletAddress: agent.walletAddress,
        vaultAddress: vault.address,
        amountUsdcCents: input.amountUsdcCents,
        execution: vault.execution,
      });
      if (!preflight.allPassed) {
        const decision: MandateDecision = {
          allowed: false,
          checkedAt: this.deps.clock.now().toISOString(),
          remainingUsdcCents: initial.remainingUsdcCents,
          expiresAt: initial.expiresAt,
          reason: `REFUSED — independent allowlist/asset/balance preflight failed: ${preflight.reason}`,
        };
        return this.refuse(input.agentId, "earn.sweep", input.amountUsdcCents, decision);
      }

      if (vault.execution === "direct-morpho") {
        const rawAmount = String(BigInt(input.amountUsdcCents) * 10_000n);
        let approval;
        if (preflight.allowanceRawAmount === rawAmount && preflight.approvalTransactionHash) {
          approval = {
            transactionHash: preflight.approvalTransactionHash,
            explorerUrl: `https://basescan.org/tx/${preflight.approvalTransactionHash}`,
          };
          await this.event(
            input.agentId,
            "earn.approve",
            "completed",
            0,
            `${directMorphoLabel}. Reused the already-confirmed exact $${(input.amountUsdcCents / 100).toFixed(2)} USDC approval to allowlisted ${vault.label}; no approval was signed again. ${approval.explorerUrl}`,
            approval.transactionHash,
          );
        } else {
          if (input.approvalPolicy === "reuse-only") {
            throw new Error("Deposit-only recovery requires an existing exact allowance with approval proof. No approval was signed.");
          }
          // Approval moves no funds, so the locked check validates the full amount while reserving zero cents.
          const approvalDecision = await this.reserveMandate(
            input.agentId,
            "earn.sweep",
            input.amountUsdcCents,
            0,
          );
          if (!approvalDecision.allowed) {
            return this.refuse(input.agentId, "earn.sweep", input.amountUsdcCents, approvalDecision);
          }
          approval = await this.deps.wallet.approveUsdc({
            walletId: agent.walletId,
            walletAddress: agent.walletAddress,
            spender: vault.address,
            amountUsdcCents: input.amountUsdcCents,
            idempotencyKey: `${input.idempotencyKey}-approve`,
          });
          await this.event(
            input.agentId,
            "earn.approve",
            "completed",
            0,
            `${directMorphoLabel}. Approved exactly $${(input.amountUsdcCents / 100).toFixed(2)} USDC to allowlisted ${vault.label}. ${approval.explorerUrl}`,
            approval.transactionHash,
          );
        }

        const simulation = await this.deps.preflight.simulateDirectDeposit({
          walletAddress: agent.walletAddress,
          vaultAddress: vault.address,
          amountUsdcCents: input.amountUsdcCents,
          approvalTransactionHash: approval.transactionHash,
        });
        if (!simulation.allPassed) {
          const currentMandate = await this.deps.store.getMandate(input.agentId);
          return this.refuse(input.agentId, "earn.sweep", input.amountUsdcCents, {
            allowed: false,
            checkedAt: this.deps.clock.now().toISOString(),
            remainingUsdcCents: currentMandate
              ? Math.max(0, currentMandate.maxTotalUsdcCents - currentMandate.spentUsdcCents)
              : 0,
            expiresAt: currentMandate?.expiresAt,
            reason: `REFUSED — direct ERC-4626 deposit eth_call simulation failed after approval: ${simulation.reason} No deposit was signed.`,
          });
        }

        const signingDecision = await this.reserveMandate(
          input.agentId,
          "earn.sweep",
          input.amountUsdcCents,
        );
        if (!signingDecision.allowed) {
          return this.refuse(input.agentId, "earn.sweep", input.amountUsdcCents, signingDecision);
        }
        const executedDeposit = await this.deps.wallet.depositDirectVault({
          walletId: agent.walletId,
          walletAddress: agent.walletAddress,
          vaultAddress: vault.address,
          amountUsdcCents: input.amountUsdcCents,
          idempotencyKey: `${input.idempotencyKey}-deposit`,
        });
        const deposit = {
          mode: "direct-morpho" as const,
          status: "succeeded" as const,
          transactionHashes: [approval.transactionHash, executedDeposit.transactionHash],
          approval,
          deposit: {
            transactionHash: executedDeposit.transactionHash,
            explorerUrl: executedDeposit.explorerUrl,
          },
          sharesReceived: executedDeposit.sharesReceived,
          sharesReceivedRaw: executedDeposit.sharesReceivedRaw,
          shareDecimals: executedDeposit.shareDecimals,
        };
        await this.event(
          input.agentId,
          "earn.sweep",
          "completed",
          input.amountUsdcCents,
          `${signingDecision.reason} ${directMorphoLabel} into allowlisted ${vault.label}; AIMorgan's vault picks were ignored. ${deposit.shareDecimals === null ? `Received ${deposit.sharesReceivedRaw} raw vault shares; formatted shares and decimals unavailable (optional RPC lookup failed). Deposit confirmed.` : `Received ${deposit.sharesReceived} vault shares (${deposit.sharesReceivedRaw} raw).`} ${deposit.deposit.explorerUrl}`,
          deposit.deposit.transactionHash,
        );
        return { vault, preflight: { ...preflight, simulation }, deposit, decision: signingDecision };
      }

      const signingDecision = await this.reserveMandate(
        input.agentId,
        "earn.sweep",
        input.amountUsdcCents,
      );
      if (!signingDecision.allowed) {
        return this.refuse(input.agentId, "earn.sweep", input.amountUsdcCents, signingDecision);
      }
      const deposit = await this.deps.wallet.depositEarn({
        walletId: agent.walletId,
        vaultId: vault.id,
        vaultAddress: vault.address,
        amountUsdcCents: input.amountUsdcCents,
        idempotencyKey: input.idempotencyKey,
      });
      await this.event(
        input.agentId,
        "earn.sweep",
        "completed",
        input.amountUsdcCents,
        `${signingDecision.reason} Deposited through Privy Earn to allowlisted ${vault.label}; AIMorgan's vault picks were ignored.`,
        deposit.actionId,
      );
      return { vault, preflight, deposit, decision: signingDecision };
    });
  }

  async publishEncryptedStatement(agentId: string, ownerKey: string): Promise<{ reference: string }> {
    const agent = await this.requireAgent(agentId);
    const mandate = await this.deps.store.getMandate(agentId);
    if (!mandate) throw new Error("No mandate exists for this agent.");
    const commitmentOpening = await this.deps.store.getMandateOpening(mandate.id);
    const events = await this.deps.store.listEvents(agentId);
    const ciphertext = await encryptStatement({ agent, mandate, commitmentOpening, events }, ownerKey);
    const uploaded = await this.deps.statementStorage.upload(ciphertext);
    await this.event(
      agentId,
      "statement.publish",
      "completed",
      0,
      "Encrypted statement published; the decryption key remains with the owner and is not stored by the gateway.",
      uploaded.reference,
    );
    return uploaded;
  }

  async state(agentId: string) {
    const stored = await this.deps.store.getAgent(agentId);
    if (!stored) throw new Error("Agent not found.");
    const resolved = await this.deps.ens.resolveIdentity(stored.ensName).catch(() => null);
    const agent = { ...stored, ensResolvedAddress: resolved?.address ?? null,
      ensExplorerUrl: resolved?.explorerUrl, ensMode: resolved?.mode };
    return {
      agent,
      mandate: await this.deps.store.getMandate(agentId),
      events: await this.deps.store.listEvents(agentId),
    };
  }

  async queryMandate(agentId: string) {
    return this.deps.arkiv.findValidMandates(agentId);
  }

  async checkMandate(agentId: string) {
    return this.mandates.decide(agentId, "usdc.transfer", 0);
  }

  async resolveIdentity(name: string) {
    return this.deps.ens.resolveIdentity(name);
  }

  async vaultRate() {
    const vault = this.selectedVault();
    const rate = await this.deps.vaultRate.getRate(vault);
    return { vault, ...rate };
  }

  private selectedVault() {
    const execution = this.deps.earnViaPrivy ? "privy-earn-api" : "direct-morpho";
    const vault = this.deps.vaultAllowlist.find((candidate) => candidate.execution === execution);
    if (!vault) throw new Error(`No allowlisted vault is configured for ${execution}.`);
    return vault;
  }

  private strategizeBody(agentAddress: Agent["walletAddress"], totalUsdcCents: number) {
    return {
      agent_address: agentAddress,
      total_usdc: (totalUsdcCents / 100).toFixed(2),
      risk_profile: "conservative",
      deterministic: true,
      dry: false,
    };
  }

  private quoteMatches(confirmed: X402QuoteConfirmation, current: X402Quote): boolean {
    return confirmed.resource === current.resource
      && confirmed.payTo.toLowerCase() === current.payTo.toLowerCase()
      && confirmed.asset.toLowerCase() === current.asset.toLowerCase()
      && confirmed.network === current.network
      && confirmed.amountAtomic === current.amountAtomic
      && confirmed.amountUsdcCents === current.amountUsdcCents
      && confirmed.method === current.method;
  }

  private async requirePriceValidation(
    agentId: string,
    action: ActionKind,
    validation: PriceValidation | undefined,
  ): Promise<void> {
    if (validation?.allPassed === true) return;
    const mandate = await this.deps.store.getMandate(agentId);
    const decision: MandateDecision = {
      allowed: false,
      reason: "REFUSED — AIMorgan priceValidation.allPassed is absent or false; nothing was signed.",
      checkedAt: this.deps.clock.now().toISOString(),
      remainingUsdcCents: mandate
        ? Math.max(0, mandate.maxTotalUsdcCents - mandate.spentUsdcCents)
        : 0,
      expiresAt: mandate?.expiresAt,
    };
    return this.refuse(agentId, action, validation?.quotedUsdcCents ?? 0, decision);
  }

  private async requireDeclaredPriceMatch(
    agentId: string,
    quote: X402Quote,
    validation: PriceValidation | undefined,
  ): Promise<void> {
    await this.requirePriceValidation(agentId, "aimorgan.strategize", validation);
    if (validation!.quotedUsdcCents === quote.amountUsdcCents) return;
    const mandate = await this.deps.store.getMandate(agentId);
    return this.refuse(agentId, "aimorgan.strategize", quote.amountUsdcCents, {
      allowed: false,
      reason: `REFUSED — AIMorgan's dry response declared $${(validation!.quotedUsdcCents / 100).toFixed(2)} USDC but the paid x402 quote requested $${(quote.amountUsdcCents / 100).toFixed(2)} USDC; nothing was signed.`,
      checkedAt: this.deps.clock.now().toISOString(),
      remainingUsdcCents: mandate
        ? Math.max(0, mandate.maxTotalUsdcCents - mandate.spentUsdcCents)
        : 0,
      expiresAt: mandate?.expiresAt,
    });
  }

  private async refuse(agentId: string, action: string, amount: number, decision: MandateDecision): Promise<never> {
    await this.event(agentId, action, "refused", amount, decision.reason);
    throw new RefusalError(decision);
  }

  private async requireAgent(agentId: string): Promise<Agent> {
    const agent = await this.deps.store.getAgent(agentId);
    if (!agent) throw new Error("Agent not found.");
    const resolved = await this.deps.ens.resolveIdentity(agent.ensName).catch(() => null);
    if (!resolved?.address || resolved.address.toLowerCase() !== agent.walletAddress.toLowerCase()) {
      return this.refuse(agentId, "ens.resolve", 0, {
        allowed: false, checkedAt: this.deps.clock.now().toISOString(), remainingUsdcCents: 0,
        reason: "REFUSED — ENS identity is unresolved, unavailable, or does not match the agent wallet. No payment or signing was attempted.",
      });
    }
    return agent;
  }

  private async reserveMandate(...args: Parameters<MandateService["decideAndReserve"]>) {
    await this.requireAgent(args[0]);
    return this.mandates.decideAndReserve(...args);
  }

  private async event(
    agentId: string,
    action: string,
    status: StatementEvent["status"],
    amountUsdcCents: number,
    reason: string,
    reference?: string,
  ): Promise<void> {
    await this.deps.store.appendEvent({
      id: randomUUID(),
      agentId,
      action,
      status,
      amountUsdcCents,
      reason,
      at: this.deps.clock.now().toISOString(),
      reference,
    });
  }

  private async idempotent<T>(
    agentId: string,
    key: string,
    input: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!key.trim()) throw new IdempotencyError("An idempotency key is required.");
    const compoundKey = `${agentId}:${key}`;
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const claim = await this.deps.store.claimIdempotency(compoundKey, fingerprint);
    if (!claim.fresh) {
      if (claim.record.state === "succeeded") return claim.record.result as T;
      throw new IdempotencyError(
        claim.record.state === "failed"
          ? `Previous attempt failed safely: ${claim.record.error}`
          : "An identical request is already in progress.",
      );
    }
    try {
      const result = await work();
      await this.deps.store.finishIdempotency(compoundKey, result);
      return result;
    } catch (error) {
      await this.deps.store.failIdempotency(compoundKey, error instanceof Error ? error.message : "Unknown error");
      throw error;
    }
  }
}
