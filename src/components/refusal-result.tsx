import type { StatementEvent } from "@/core/types";

export function RefusalResult({ refusal, expired, remaining, running, error }: {
  refusal?: StatementEvent; expired: boolean; remaining: number; running: boolean; error: boolean;
}) {
  return <section id="refusal-result" className={`refusal-stage ${refusal ? "refusal-complete" : "refusal-waiting"}`} aria-labelledby="refusal-heading">
    <p className="panel-label">04 / THE END OF PERMISSION</p>
    {refusal ? <div className="refusal-reveal">
      <p className="result-badge">{expired ? "AUTOMATIC EXPIRY · EXPECTED RESULT" : "GATEWAY DECISION"}</p>
      <h2 id="refusal-heading">{expired ? "Time’s up. Atlas cannot spend again." : "The gateway stopped this action."}</h2>
      <p className="refusal-status" role="status">Action refused</p>
      <p>{expired ? `Atlas tried to send another $0.05. $${(remaining / 100).toFixed(2)} of budget remained, but its permission had expired.` : "Read the gateway’s decision for the reason."}</p>
      {expired && <p className="refusal-outcome">No new transfer. Nobody revoked anything.</p>}
      <details><summary>Why it was refused</summary><p>{refusal.reason}</p></details>
    </div> : <div>
      <h2 id="refusal-heading">What happens when time runs out?</h2>
      <p>{error ? "The demo was interrupted. No expiry result is confirmed here." : running ? "Waiting for permission to expire. The next attempted transfer will reveal the gateway’s decision." : "Run the demo to see Atlas’s next action after its two-minute permission ends."}</p>
      <p>Time—not an empty budget—is the limit this demo demonstrates.</p>
    </div>}
  </section>;
}
