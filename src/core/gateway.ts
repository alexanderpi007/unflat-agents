import { createHash, randomUUID } from "node:crypto";
import { IdempotencyError, RefusalError } from "./errors";
import { MandateService } from "./mandates";
import type { Dependencies } from "./ports";
import { encryptStatement } from "./statement";
import type {
  ActionKind,
  Agent,
  Mandate,
  MandateDecision,
  PriceValidation,
  StatementEvent,
  Strategy,
} from "./types";

const allActions: ActionKind[] = ["x402.pay", "aimorgan.strategize", "earn.sweep"];

export class SigningGateway {
  private readonly mandates: MandateService;

  constructor(private readonly deps: Dependencies) {
    if (deps.vaultAllowlist.length === 0) throw new Error("At least one unflat vault must be allowlisted.");
    this.mandates = new MandateService(deps.store, deps.clock);
  }

  async createAgent(displayName: string): Promise<Agent> {
    const label = displayName
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36);
    if (!label) throw new Error("Agent name must contain a letter or number.");

    const wallet = await this.deps.wallet.createWallet();
    const identity = await this.deps.ens.createIdentity(label, wallet.address);
    const agent: Agent = {
      id: randomUUID(),
      displayName,
      ensName: identity.name,
      walletId: wallet.walletId,
      walletAddress: wallet.address,
      createdAt: this.deps.clock.now().toISOString(),
    };
    await this.deps.store.putAgent(agent);
    await this.event(agent.id, "agent.create", "completed", 0, `Agent created as ${identity.name}.`, identity.reference);
    return agent;
  }

  async grantMandate(input: {
    agentId: string;
    ownerId: string;
    durationSeconds: number;
    maxPerActionUsdcCents: number;
    maxTotalUsdcCents: number;
    allowedActions?: ActionKind[];
  }): Promise<Mandate> {
    if (!(await this.deps.store.getAgent(input.agentId))) throw new Error("Agent not found.");
    if (input.durationSeconds <= 0) throw new Error("Mandate duration must be positive.");
    if (input.maxPerActionUsdcCents <= 0 || input.maxTotalUsdcCents <= 0) {
      throw new Error("Mandate limits must be positive.");
    }

    const now = this.deps.clock.now();
    const existing = await this.deps.store.getMandate(input.agentId);
    if (existing && now.getTime() < new Date(existing.expiresAt).getTime()) {
      throw new Error(`An active mandate already exists until ${existing.expiresAt}; wait for its TTL to expire.`);
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

    const arkiv = await this.deps.arkiv.publishMandate(mandate);
    const published = { ...mandate, arkivEntityKey: arkiv.entityKey };
    await this.deps.store.putMandate(published);
    await this.event(
      input.agentId,
      "mandate.grant",
      "completed",
      0,
      `Mandate granted until ${published.expiresAt}; expiry is automatic and no revocation transaction exists.`,
      arkiv.entityKey,
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
      const signingDecision = await this.mandates.decideAndReserve(
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
        settlement.settlementId,
      );
      return { quote, settlement, decision: signingDecision };
    });
  }

  async strategize(input: { agentId: string; totalUsdcCents: number; idempotencyKey: string }): Promise<Strategy> {
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

      const quote = await this.deps.x402.quote("https://aimorgan.net/api/strategize", {
        method: "POST",
        body: {
          agent_address: agent.walletAddress,
          total_usdc: (input.totalUsdcCents / 100).toFixed(2),
          dry: false,
        },
      });
      const quoteValidation = await this.deps.aiMorgan.validatePrice(quote);
      await this.requirePriceValidation(input.agentId, "aimorgan.strategize", quoteValidation);

      const signingDecision = await this.mandates.decideAndReserve(
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
  }) {
    return this.idempotent(input.agentId, input.idempotencyKey, input, async () => {
      const agent = await this.requireAgent(input.agentId);
      const strategy = await this.deps.store.getStrategy(input.agentId, input.strategyId);
      if (!strategy) throw new Error("Validated strategy not found in the gateway store.");
      const initial = await this.mandates.decide(input.agentId, "earn.sweep", input.amountUsdcCents);
      if (!initial.allowed) return this.refuse(input.agentId, "earn.sweep", input.amountUsdcCents, initial);
      await this.requirePriceValidation(input.agentId, "earn.sweep", strategy.priceValidation);

      // AIMorgan's vault picks are advisory. The deposit target comes only from our allowlist.
      const vault = this.deps.vaultAllowlist[0];
      const preflight = await this.deps.preflight.verifyEarn({
        walletAddress: agent.walletAddress,
        vaultAddress: vault.address,
        amountUsdcCents: input.amountUsdcCents,
      });
      if (!preflight.allPassed || !preflight.allowanceOk) {
        const decision: MandateDecision = {
          allowed: false,
          checkedAt: this.deps.clock.now().toISOString(),
          remainingUsdcCents: initial.remainingUsdcCents,
          expiresAt: initial.expiresAt,
          reason: `REFUSED — independent gas/allowance preflight failed: ${preflight.reason}`,
        };
        return this.refuse(input.agentId, "earn.sweep", input.amountUsdcCents, decision);
      }

      const signingDecision = await this.mandates.decideAndReserve(
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
    const events = await this.deps.store.listEvents(agentId);
    const ciphertext = await encryptStatement({ agent, mandate, events }, ownerKey);
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
    const agent = await this.requireAgent(agentId);
    return {
      agent,
      mandate: await this.deps.store.getMandate(agentId),
      events: await this.deps.store.listEvents(agentId),
    };
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

  private async refuse(agentId: string, action: string, amount: number, decision: MandateDecision): Promise<never> {
    await this.event(agentId, action, "refused", amount, decision.reason);
    throw new RefusalError(decision);
  }

  private async requireAgent(agentId: string): Promise<Agent> {
    const agent = await this.deps.store.getAgent(agentId);
    if (!agent) throw new Error("Agent not found.");
    return agent;
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
