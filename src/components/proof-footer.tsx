import type { ArkivMandateQuery, Mandate, RuntimeHealth } from "@/core/types";
import type { RealRun } from "@/demo/export-real-run";
import { RealRunProofs } from "./real-run-proofs";

const repo = "https://github.com/alexanderpi007/unflat-agents/blob/main";

export function ProofFooter({ realRuns, liveMoney, started, showingRealRun, deposit, nameVerified, ensName = "atlas.agents.unflat.eth", mandate, before, after, health, children }: {
  realRuns: RealRun[];
  deposit?: string;
  ensName?: string;
  showingRealRun: boolean;
  liveMoney: boolean; started: boolean; nameVerified: boolean; mandate?: Mandate;
  before?: ArkivMandateQuery; after?: ArkivMandateQuery; health?: RuntimeHealth; children: React.ReactNode;
}) {
  return <section className="story-section proof-footer" id="proofs" aria-labelledby="proofs-heading">
    <p className="panel-label">06 / VERIFY IT YOURSELF</p><h2 id="proofs-heading">What is real?</h2>
    <p>Real evidence first. Try a simulation without moving funds.</p>
    <RealRunProofs runs={realRuns} />
    <div className="proof-list">
      <article><h3>Money</h3><p>{showingRealRun ? "Real run shown above; simulations never broadcast." : started && liveMoney ? "This run uses real Base funds." : "Simulation shown above; simulations never broadcast."}</p>
        {deposit && <a className="proof-chip" title={deposit} href={`https://basescan.org/tx/${deposit}`} target="_blank" rel="noreferrer">Base ↗</a>}
      </article>
      <article><h3>Permission</h3><p>{mandate ? "A real entity disappears when permission expires." : health?.adapters.arkiv.mode === "live" ? "Each run creates expiring permission on Tiramisu." : "Live connection not yet verified."}</p>
        <a className="proof-chip" title={mandate?.arkivEntityKey ?? "Earlier Mission 02 evidence"} href={mandate?.arkivExplorerUrl ?? `${repo}/arkiv/submission.md#mission-02-evidence`} target="_blank" rel="noreferrer">Arkiv ↗</a>
        <details><summary>Query evidence</summary><p>Before: {before?.found ? "found" : "not captured"}, block {before?.blockNumber.toString() ?? "—"}. After: {after && !after.found ? "empty" : "not confirmed"}, block {after?.blockNumber.toString() ?? "—"}.</p><p>Fresh queries, no delete or extension. <a href={`${repo}/arkiv/submission.md#mission-02-evidence`}>Earlier Mission 02 proof ↗</a></p></details>
      </article>
      <article><h3>Identity</h3><p>{nameVerified ? "This agent’s name resolves to its wallet on Sepolia." : "Live resolution pending; registration proof is available."}</p>
        <a className="proof-chip" title={ensName} href={`https://explorer.ens.dev/${ensName}`} target="_blank" rel="noreferrer">ENS ↗</a>
      </article>
      <article><h3>Owner’s record</h3><p>Real encrypted storage, on the owner’s funded drive.</p>
        <a className="proof-chip" title="Owner-verified retrieval evidence; no secret reference" href={`${repo}/swarm/README.md`} target="_blank" rel="noreferrer">Swarm ↗</a>
        <details><summary>Earlier retrieval proof</summary><p>5,582 bytes, native encryption, about four days of storage. Connect and publish to save your own run. Your secret reference is never public.</p></details>
      </article>
    </div>
    <details><summary>Technical details and integration limits</summary><p>Public runs cannot move Base funds or update ENS records. Privy Earn is pending activation; local LIVE deposits use direct Morpho. Morpho’s variable APY is not a guaranteed return. AIMorgan advice is simulated publicly and fee-waived locally.</p>{children}</details>
  </section>;
}
