import type { Agent, DemoSnapshot, Mandate, StatementEvent } from "@/core/types";

export type RealRun = { version: 1; label: string; snapshot: DemoSnapshot };

// Whitelist output fields; never serialize the store, mandate openings or SDK credentials.
export function exportRealRun(agent: Agent, mandate: Mandate, allEvents: StatementEvent[]): RealRun {
  const events = allEvents.filter(e => e.agentId === agent.id && e.at >= mandate.createdAt);
  const completed = (action: string) => events.find(e => e.action === action && e.status === "completed");
  const hashes = ["usdc.transfer", "earn.approve", "earn.sweep"].map(action => completed(action)?.reference);
  const refusal = events.find(e => e.status === "refused" && e.action === "usdc.transfer");
  if (events.some(e => /MOCK|simulated/i.test(e.reason)) || hashes.some(h => !/^0x[0-9a-f]{64}$/i.test(h ?? ""))
    || !completed("mandate.grant") || !mandate.arkivEntityKey || !refusal
    || !/Arkiv returned no matching unexpired entity at block \d+/.test(refusal.reason)
    || mandate.spentUsdcCents !== 105 || mandate.maxTotalUsdcCents !== 120) {
    throw new Error("Export requires a complete LIVE transfer, approval, deposit and expiry refusal with $0.15 remaining.");
  }
  const publicEvents = events.filter(e => ["ens.records", "ens.readonly", "mandate.grant", "usdc.transfer", "aimorgan.strategize", "earn.approve", "earn.sweep"].includes(e.action)).map(e => {
    const block = e.reason.match(/Arkiv returned no matching unexpired entity at block (\d+)/)?.[1];
    const shares = e.reason.match(/Received (\d+) raw vault shares/)?.[1];
    const reasons: Record<string, string> = {
      "ens.records": "ENS name records updated for this mandate.",
      "ens.readonly": "ENS identity resolved to the agent wallet.",
      "mandate.grant": "A real two-minute Arkiv mandate was granted. Expiry requires no revocation transaction.",
      "usdc.transfer": "Transferred 0.05 USDC on Base under the mandate.",
      "aimorgan.strategize": "Dry strategize ran before the free call. AIMorgan fee waived for the demo (our own service; x402 relay offline).",
      "earn.approve": "Approved exactly 1.00 USDC to the allowlisted vault.",
      "earn.sweep": `Deposited 1.00 USDC. Direct Morpho deposit (Privy Earn pending activation).${shares ? ` Received ${shares} raw vault shares; formatted shares unavailable.` : " See the receipt for shares received."}`,
    };
    const reference = e.reference && (/^0x[0-9a-f]{64}$/i.test(e.reference) || /^https:\/\/(sepolia\.etherscan\.io\/tx|tiramisu\.explorer\.arkiv\.network\/entity)\/0x[0-9a-f]{64}$/i.test(e.reference)) ? e.reference : undefined;
    return { id: e.id, agentId: agent.id, action: e.action, status: e.status, amountUsdcCents: e.amountUsdcCents,
      at: e.at, reference, reason: e.status === "refused"
        ? `REFUSED — mandate expired or absent: Arkiv returned no matching unexpired entity at block ${block}. TTL expiry removed authorization. No revocation was needed.` : reasons[e.action] };
  });
  return { version: 1, label: `Real run · Base mainnet · ${new Date(mandate.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome" }).replace("Sept", "Sep")}`,
    snapshot: {
      agent: { id: agent.id, displayName: agent.displayName, ensName: agent.ensName, walletAddress: agent.walletAddress,
        walletId: "not-exported", createdAt: agent.createdAt, ensMode: agent.ensMode,
        ensResolvedAddress: agent.ensResolvedAddress, ensExplorerUrl: agent.ensExplorerUrl },
      mandate: { id: mandate.id, agentId: mandate.agentId, ownerId: "not-exported", allowedActions: mandate.allowedActions,
        maxPerActionUsdcCents: mandate.maxPerActionUsdcCents, maxTotalUsdcCents: mandate.maxTotalUsdcCents,
        spentUsdcCents: mandate.spentUsdcCents, startsAt: mandate.startsAt, expiresAt: mandate.expiresAt, createdAt: mandate.createdAt,
        arkivEntityKey: mandate.arkivEntityKey, arkivTransactionHash: mandate.arkivTransactionHash,
        arkivExplorerUrl: `https://tiramisu.explorer.arkiv.network/entity/${mandate.arkivEntityKey}`,
        arkivExpiresAtBlock: mandate.arkivExpiresAtBlock, arkivCommitment: mandate.arkivCommitment },
      events: publicEvents,
    },
  };
}
