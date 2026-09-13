import type { DemoSnapshot } from "@/core/types";

// A plain-language retelling, not quotes or a claim to have captured client chat logs.
export function runStory({ agent, mandate, events }: DemoSnapshot) {
  const done = (action: string) => events.find(e => e.action === action && e.status === "completed");
  const amount = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const lines: { speaker: string; text: string }[] = [];
  if (done("ens.records") || done("ens.readonly")) lines.push({ speaker: "Agent", text: `My account is ${agent.ensName}.` });
  if (done("mandate.grant")) lines.push({ speaker: "Owner", text: `You have two minutes and a ${amount(mandate.maxTotalUsdcCents)} budget.` });
  const payment = done("usdc.transfer");
  if (payment) lines.push({ speaker: "Agent", text: `I sent ${amount(payment.amountUsdcCents)} on Base.` });
  if (done("aimorgan.strategize")) lines.push({ speaker: "Agent", text: "I asked for savings advice before saving." });
  const saved = done("earn.sweep");
  if (saved) lines.push({ speaker: "Agent", text: `I saved ${amount(saved.amountUsdcCents)} in the approved vault.` });
  if (events.some(e => e.action === "usdc.transfer" && e.status === "refused" && /Arkiv returned no matching unexpired entity/.test(e.reason))) {
    lines.push({ speaker: "Agent", text: `Time ran out. My next payment was refused, with ${amount(mandate.maxTotalUsdcCents - mandate.spentUsdcCents)} left.` });
  }
  return lines;
}
