import type { StatementEvent } from "@/core/types";

export function RefusalResult({ refusal, expired, remaining, running, error }: {
  refusal?: StatementEvent; expired: boolean; remaining: number; running: boolean; error: boolean;
}) {
  return <section id="refusal-result" className={`refusal-stage ${refusal ? "refusal-complete" : "refusal-waiting"}`} aria-labelledby="refusal-heading">
    <p className="panel-label">04 / THE END OF PERMISSION</p>
    {refusal ? <div className="refusal-reveal">
      <h2 id="refusal-heading">{expired ? "Permission expired, not the budget." : "The gateway stopped this action."}</h2>
      <p className="refusal-status" role="status">Action refused</p>
      <p>{expired ? "The next transfer was refused because authorization expired, without a revocation transaction." : "Read the gateway’s decision for the reason."}</p>
      <details><summary>Why it was refused</summary><p>{refusal.reason}</p></details>
    </div> : <div>
      <h2 id="refusal-heading">What happens when time runs out?</h2>
      <p>{error ? "Interrupted; expiry is not confirmed." : running ? "The next attempted transfer will reveal the gateway’s decision." : "Time ends the permission—not an empty budget."}</p>
    </div>}
  </section>;
}
