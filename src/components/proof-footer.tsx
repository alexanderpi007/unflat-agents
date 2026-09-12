import type { ArkivMandateQuery, Mandate, RuntimeHealth } from "@/core/types";

const repo = "https://github.com/alexanderpi007/unflat-agents/blob/main";
const historicalTransfer = "https://basescan.org/tx/0xb082890bd85d47e8488b0bc268f04a3cd6ce5636a223f300192e033ff36a7c12";
const historicalDeposit = "https://basescan.org/tx/0x3d82d0a3e51fc99655736a02831a2a93599c2628ea58888a6de427202afd313f";

export function ProofFooter({ liveMoney, started, nameVerified, mandate, before, after, health, children }: {
  liveMoney: boolean; started: boolean; nameVerified: boolean; mandate?: Mandate;
  before?: ArkivMandateQuery; after?: ArkivMandateQuery; health?: RuntimeHealth; children: React.ReactNode;
}) {
  return <section className="story-section proof-footer" id="proofs" aria-labelledby="proofs-heading">
    <p className="panel-label">06 / VERIFY IT YOURSELF</p><h2 id="proofs-heading">What is real?</h2>
    <p>The public site cannot move Base funds. Evidence from earlier live runs is labelled separately below.</p>
    <div className="proof-list">
      <article><h3>Money · Base</h3><p>{started ? liveMoney ? "This run: real money. See each completed transaction in the action feed." : "This run: simulated money. No Base transactions were broadcast." : "Public demo: simulated money. No run started here yet."}</p>
        <p>Earlier real run: $0.05 sent and $1.00 deposited.</p><div className="proof-links"><a href={historicalTransfer} target="_blank" rel="noreferrer">Earlier transfer ↗</a><a href={historicalDeposit} target="_blank" rel="noreferrer">Earlier deposit ↗</a></div></article>
      <article><h3>Expiring permission · Arkiv</h3><p>{mandate ? "This run’s permission is shown below. Expiry is confirmed only by the gateway’s query." : health?.adapters.arkiv.mode === "live" ? "Live Tiramisu testnet. Start the demo to create your run’s expiring permission." : "Live connection not confirmed. The dashboard requires Arkiv; it will not invent a live entity."}</p>
        {mandate?.arkivExplorerUrl && <a href={mandate.arkivExplorerUrl} target="_blank" rel="noreferrer">This run’s entity ↗</a>}
        {(before || after) && <p className="query-proof">Before expiry: {before?.found ? "found" : "not captured"}. After expiry: {after && !after.found ? "empty" : "not confirmed yet"}.</p>}
        <a href={`${repo}/arkiv/submission.md#mission-02-evidence`} target="_blank" rel="noreferrer">Earlier Mission 02 proof ↗</a>
        <details><summary>Query evidence</summary><p>Before block: {before?.blockNumber.toString() ?? "Not captured"}. After block: {after?.blockNumber.toString() ?? "Not captured"}.</p><p>Fresh queries check agent_id, expiry and creator. No delete or extension is used in the demo.</p></details></article>
      <article><h3>Agent name · ENS</h3><p>{nameVerified ? "Resolved live on Sepolia: Atlas’s name points to its wallet." : "Live resolution is not confirmed in this view. The earlier registration proof is available below."}</p>
        <div className="proof-links"><a href="https://explorer.ens.dev/atlas.agents.unflat.eth" target="_blank" rel="noreferrer">Explore Atlas’s name ↗</a><a href="https://sepolia.etherscan.io/tx/0xb3026ea2ad2d53cd463fbe47a3cfcda39c218d7f53b78a6836fc9a54adfaf5bf" target="_blank" rel="noreferrer">Earlier registration ↗</a></div><p>The public site reads ENS. It does not sign name updates.</p></article>
      <article><h3>Owner’s statement · Swarm</h3><p>Live storage when you connect your funded drive and publish. Connecting alone does not upload a statement.</p><p>Earlier owner-verified round trip: 5,582 bytes, native encryption, about four days of storage. This is not a new upload by you.</p><a href={`${repo}/swarm/README.md`} target="_blank" rel="noreferrer">Retrieval evidence and instructions ↗</a><p>No secret retrieval reference is published here.</p></article>
      <article><h3>Yield · Morpho</h3><p>The rate above is read from Morpho’s API when available—not a promise or a simulated return. No number is invented when the rate is unavailable.</p><a href={`${repo}/README.md#four-live-proofs`} target="_blank" rel="noreferrer">Vault and transaction evidence ↗</a></article>
    </div>
    <details><summary>Technical details and integration limits</summary><p>Privy Earn is pending activation; real deposits use the approved direct Morpho path. AIMorgan advice is simulated in public runs; local LIVE runs use the fee-waived service.</p>{children}</details>
  </section>;
}
