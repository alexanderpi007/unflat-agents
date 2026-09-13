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
    <p>Recorded proofs and current server configuration are different things.</p>
    <details><summary>Proof index for both archived runs</summary><RealRunProofs runs={realRuns} /></details>
    <div className="proof-list">
      <article><h3>Money</h3><p>{showingRealRun ? "Real run shown above; simulations never broadcast Base transactions." : started && liveMoney ? "This run uses real Base funds." : "Simulation shown above; simulations never broadcast Base transactions."}</p>
        <a href="#top">Selected run ↑</a>
      </article>
      <article><h3>Permission</h3><p>Budget and expiry are enforced by gateway software, not by Privy's signer policy.</p>
        <a href={`${repo}/src/core/mandates.ts`} target="_blank" rel="noreferrer">Mandate checks ↗</a>
        <details><summary>Query evidence</summary>{showingRealRun ? <p>The <a href={`${repo}/docs/COPY-AUDIT.md#run-proofs`}>dated run audit ↗</a> verifies both archived entities before and after expiry, including their creation-only event histories.</p>
          : <p>This interactive run: before {before?.found ? "found" : "not captured"}, block {before?.blockNumber.toString() ?? "—"}; after {after && !after.found ? "empty" : "not confirmed"}, block {after?.blockNumber.toString() ?? "—"}.</p>}</details>
      </article>
      <article><h3>Wallet control</h3><p>Expiry does not revoke Privy's delegated signer. The operator must be trusted to enforce the mandate.</p>
        <a href={`${repo}/docs/OWNERSHIP.md`} target="_blank" rel="noreferrer">Ownership implementation ↗</a>
        <details><summary>Ownership and trust limits</summary><p>For nova, Privy holds the wallet key and the gateway uses a separate delegation credential. The owner can revoke that delegation through the Privy-authenticated owner screen on the local server or tunnel. A compromised gateway could bypass its software budget within the signer policy's allowed methods. Atlas is a legacy app-owned wallet. Owner recovery without this server requires a prior private-key backup or another working Privy client.</p></details>
      </article>
      <article><h3>Earlier Swarm proof</h3><p>Owner-reported upload and retrieval on 12 September: 5,582 bytes of a mock-money statement.</p>
        <a className="proof-chip" title="Owner-verified retrieval evidence; no secret reference" href={`${repo}/swarm/README.md`} target="_blank" rel="noreferrer">Swarm ↗</a>
        <details><summary>Retrieval evidence limits</summary><p>Native encryption and deferred upload; estimated retention was 4.09 days at upload, not a guarantee of availability now. This was a different, earlier run. No proof that either archived run above was published is claimed. Fresh-session retrieval was not independently recorded.</p></details>
      </article>
    </div>
    <details><summary>Technical details and integration limits</summary><p>The public simulation mocks money and AIMorgan advice, writes a real Arkiv entity when configured, and uses read-only ENS. The archived deposits called Morpho directly via Privy signing, not Privy Earn. A previous Privy Earn attempt returned 409 invalid_state; activation was suspected, not established. Local server configuration is independent of the selected archive.</p><p>Configuration below describes this server, not a fresh uptime check or the archived runs.</p>{children}<a href={`${repo}/docs/COPY-AUDIT.md`} target="_blank" rel="noreferrer">Full copy audit and evidence ↗</a></details>
  </section>;
}
