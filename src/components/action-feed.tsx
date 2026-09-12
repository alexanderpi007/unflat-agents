import type { StatementEvent } from "@/core/types";

export function ActionFeed({ events, mockMoney, history = false }: { events: StatementEvent[]; mockMoney: boolean; history?: boolean }) {
  const titles: Record<string, string> = {
    "agent.create": "Atlas’s identity is ready",
    "ens.records": "Atlas’s name records are updated",
    "ens.readonly": "Atlas’s name is verified",
    "mandate.grant": "Two-minute budget granted",
    "usdc.transfer": "Atlas sends USDC",
    "aimorgan.strategize": "Atlas requests a savings recommendation",
    "earn.approve": "Exact deposit amount approved",
    "earn.sweep": "Atlas moves idle money into the approved savings vault",
  };
  return <article className="timeline panel">
    <div className="section-head"><div><span>{history ? "HISTORY" : "03 / THE ACTIONS"}</span><h3>{history ? "Earlier recorded decisions" : "What Atlas does with permission"}</h3></div></div>
    {!events.length && <p>No actions yet. Start the demo to grant a budget, watch Atlas act, then see permission expire.</p>}
    <div className="events">{events.filter(event => history || event.status !== "refused").map(event => {
      const eventMock = history ? /MOCK|simulated/i.test(event.reason) : mockMoney;
      const simulated = eventMock && ["usdc.transfer", "earn.approve", "earn.sweep", "aimorgan.strategize"].includes(event.action);
      const reference = event.reference ?? "";
      const proof = /^https:\/\/(tiramisu\.explorer\.arkiv\.network|sepolia\.etherscan\.io)\//.test(reference)
        ? reference : !eventMock && ["usdc.transfer", "earn.approve", "earn.sweep"].includes(event.action) && /^0x[0-9a-fA-F]{64}$/.test(reference)
          ? `https://basescan.org/tx/${reference}` : undefined;
      return <div className="event" key={event.id}>
        <time>{history ? new Date(event.at).toLocaleString("en-GB") : new Date(event.at).toLocaleTimeString("en-GB")}</time><i className={event.status} />
        <div><strong>{event.status === "refused" ? "Refused: " : event.status === "failed" ? "Failed: " : simulated ? "Simulated: " : ""}{titles[event.action] ?? "Gateway decision recorded"}</strong>
          {proof && <a href={proof} target="_blank" rel="noreferrer">View {event.action === "mandate.grant" ? "expiring permission" : "transaction"} ↗</a>}
          <details><summary>Decision details</summary><p>{event.action} · {event.status}</p><p>{event.reason}</p></details>
        </div>
        <span>{event.amountUsdcCents ? `$${(event.amountUsdcCents / 100).toFixed(2)}` : "—"}</span>
      </div>;
    })}</div>
  </article>;
}
