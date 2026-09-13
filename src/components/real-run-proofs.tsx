import type { RealRun } from "@/demo/export-real-run";

export function RealRunProofs({ runs }: { runs: RealRun[] }) {
  return <div className="real-run-proofs" aria-label="Both real runs’ proofs">{runs.map(run => <article key={run.snapshot.mandate.id}>
    <h3>{run.snapshot.agent.displayName} · {run.presentation?.client}</h3>
    <p>{run.label.replace("Real run · ", "")}</p>
    {run.snapshot.events.filter(e => e.status === "completed" && e.reference && ["usdc.transfer", "earn.approve", "earn.sweep", "ens.records", "ens.readonly", "mandate.grant"].includes(e.action)).map(e => {
      const label = e.action === "mandate.grant" ? "Arkiv" : e.action.startsWith("ens.") ? "ENS" : "Base";
      return <a key={e.id} className="proof-chip" href={label === "Base" ? `https://basescan.org/tx/${e.reference}` : e.reference}
        title={`${e.action}: ${e.reference}`} aria-label={`${run.snapshot.agent.displayName} ${e.action} proof`} target="_blank" rel="noreferrer">{label} ↗</a>;
    })}
  </article>)}</div>;
}
