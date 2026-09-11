import type { Clock, GatewayStore } from "./ports";
import type { ActionKind, Mandate, MandateDecision } from "./types";

const money = (cents: number) => `$${(cents / 100).toFixed(2)} USDC`;

export class MandateService {
  constructor(
    private readonly store: GatewayStore,
    private readonly clock: Clock,
  ) {}

  async decide(agentId: string, action: ActionKind, amountUsdcCents: number): Promise<MandateDecision> {
    return this.evaluate(await this.store.getMandate(agentId), action, amountUsdcCents);
  }

  async decideAndReserve(agentId: string, action: ActionKind, amountUsdcCents: number): Promise<MandateDecision> {
    let decision: MandateDecision | undefined;
    await this.store.updateMandate(agentId, (mandate) => {
      decision = this.evaluate(mandate, action, amountUsdcCents);
      return decision.allowed
        ? { ...mandate, spentUsdcCents: mandate.spentUsdcCents + amountUsdcCents }
        : mandate;
    });
    return decision ?? this.evaluate(undefined, action, amountUsdcCents);
  }

  private evaluate(mandate: Mandate | undefined, action: ActionKind, amountUsdcCents: number): MandateDecision {
    const checkedAt = this.clock.now().toISOString();
    if (!mandate) {
      return { allowed: false, reason: "REFUSED — no mandate exists for this agent.", checkedAt, remainingUsdcCents: 0 };
    }

    const remaining = Math.max(0, mandate.maxTotalUsdcCents - mandate.spentUsdcCents);
    const base = { checkedAt, remainingUsdcCents: remaining, expiresAt: mandate.expiresAt };
    if (this.clock.now().getTime() < new Date(mandate.startsAt).getTime()) {
      return { ...base, allowed: false, reason: `REFUSED — mandate starts at ${mandate.startsAt}.` };
    }
    if (this.clock.now().getTime() >= new Date(mandate.expiresAt).getTime()) {
      return { ...base, allowed: false, reason: `REFUSED — mandate expired at ${mandate.expiresAt}. No revocation was needed.` };
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
      reason: `APPROVED — ${action} is within the active mandate; ${money(remaining - amountUsdcCents)} remains.`,
    };
  }
}

