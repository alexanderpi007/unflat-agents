function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function RetrievedStatement({ text }: { text: string }) {
  let data: unknown;
  try { data = JSON.parse(text); } catch { /* Plain-text uploads remain readable. */ }
  const statement = record(data) ? data : undefined;
  const agent = record(statement?.agent) ? statement.agent : undefined;
  const events = Array.isArray(statement?.events) ? statement.events.filter(record) : [];
  const readable = typeof agent?.displayName === "string" && typeof agent.id === "string";
  return <section className="retrieved-statement" aria-label="Statement retrieved from Swarm">
    <h3>Retrieved from your Swarm drive</h3>
    <p>This content was downloaded and decrypted in your browser. It is a stored record, not a new live verification.</p>
    {readable && <><h4>{agent.displayName as string}’s statement</h4><p>Agent record: {agent.id as string}</p>
      <p>{statement?.source === "mock-demo" ? "Recorded actions: simulated money." : "Source: owner’s saved record."}</p>
      <ul>{events.map((event, index) => <li key={index}>
        <strong>{typeof event.status === "string" ? event.status : "Recorded decision"}</strong>
        {typeof event.amountUsdcCents === "number" && Number.isFinite(event.amountUsdcCents) && <span> · ${(event.amountUsdcCents / 100).toFixed(2)}</span>}
        <p>{typeof event.reason === "string" ? event.reason : "No readable reason in this record."}</p>
      </li>)}</ul></>}
    <details open={!readable}><summary>Original statement data</summary><pre>{text}</pre></details>
  </section>;
}
