import type { ArkivPort, Clock, GatewayStore } from "./ports";
import type { ActionKind, ArkivMandateQuery, Mandate, MandateDecision } from "./types";

const money = (cents: number) => `$${(cents / 100).toFixed(2)} USDC`;

export class MandateService {
  constructor(
    private readonly store: GatewayStore,
    private readonly clock: Clock,
    private readonly arkiv: ArkivPort,
  ) {}

  async decide(agentId: string, action: ActionKind, amountUsdcCents: number): Promise<MandateDecision> {
    const [mandate, authorization] = await Promise.all([
      this.store.getMandate(agentId),
      this.queryAuthorization(agentId),
    ]);
    return this.evaluate(mandate, authorization, action, amountUsdcCents);
  }

  async decideAndReserve(
    agentId: string,
    action: ActionKind,
    amountUsdcCents: number,
    reserveUsdcCents = amountUsdcCents,
  ): Promise<MandateDecision> {
    if (reserveUsdcCents < 0 || reserveUsdcCents > amountUsdcCents) {
      throw new Error("Mandate reservation must be between zero and the checked action amount.");
    }
    const authorization = await this.queryAuthorization(agentId);
    const stored = await this.store.getMandate(agentId);
    if ("error" in authorization) {
      return this.evaluate(stored, authorization, action, amountUsdcCents);
    }
    let decision: MandateDecision | undefined;
    await this.store.updateMandate(agentId, (mandate) => {
      decision = this.evaluate(mandate, authorization, action, amountUsdcCents);
      return decision.allowed
        ? { ...mandate, spentUsdcCents: mandate.spentUsdcCents + reserveUsdcCents }
        : mandate;
    });
    return decision ?? this.evaluate(undefined, authorization, action, amountUsdcCents);
  }

  private async queryAuthorization(agentId: string): Promise<{ query: ArkivMandateQuery } | { error: string }> {
    try {
      return { query: await this.arkiv.findValidMandates(agentId) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "unknown Arkiv query failure" };
    }
  }

  private evaluate(
    mandate: Mandate | undefined,
    authorization: { query: ArkivMandateQuery } | { error: string },
    action: ActionKind,
    amountUsdcCents: number,
  ): MandateDecision {
    const checkedAt = this.clock.now().toISOString();
    const remaining = mandate
      ? Math.max(0, mandate.maxTotalUsdcCents - mandate.spentUsdcCents)
      : 0;
    const base = { checkedAt, remainingUsdcCents: remaining, expiresAt: mandate?.expiresAt };
    if ("error" in authorization) {
      return {
        ...base,
        allowed: false,
        reason: `REFUSED — Arkiv authorization query failed closed: ${authorization.error}. Nothing was signed.`,
      };
    }
    if (!mandate) {
      return {
        ...base,
        allowed: false,
        reason: `REFUSED — no gateway mandate exists for this agent; Arkiv was queried at block ${authorization.query.blockNumber}.`,
      };
    }

    const activeEntity = authorization.query.entities.find((entity) =>
      entity.entityKey.toLowerCase() === mandate.arkivEntityKey?.toLowerCase()
      && entity.commitment.toLowerCase() === mandate.arkivCommitment?.toLowerCase());
    if (!activeEntity) {
      return {
        ...base,
        allowed: false,
        reason: `REFUSED — mandate expired or absent: Arkiv returned no matching unexpired entity at block ${authorization.query.blockNumber}. TTL expiry removed authorization. No revocation was needed.`,
      };
    }
    if (this.clock.now().getTime() < new Date(mandate.startsAt).getTime()) {
      return { ...base, allowed: false, reason: `REFUSED — mandate starts at ${mandate.startsAt}.` };
    }
    if (!mandate.allowedActions.includes(action)) {
      return { ...base, allowed: false, reason: `REFUSED — mandate does not allow ${action}.` };
    }
    if (amountUsdcCents > mandate.maxPerActionUsdcCents) {
      return { ...base, allowed: false, reason: `REFUSED — ${money(amountUsdcCents)} exceeds the per-action limit of ${money(mandate.maxPerActionUsdcCents)}.` };
    }
    if (amountUsdcCents > remaining) {
      return { ...base, allowed: false, reason: `REFUSED — ${money(amountUsdcCents)} exceeds the remaining mandate budget of ${money(remaining)}.` };
    }
    return {
      ...base,
      allowed: true,
      remainingUsdcCents: remaining - amountUsdcCents,
      reason: `APPROVED — Arkiv entity ${activeEntity.entityKey} is live at block ${authorization.query.blockNumber}; ${action} is within the mandate and ${money(remaining - amountUsdcCents)} remains.`,
    };
  }
}
