import type { StatementEvent } from "@/core/types";

export function ActionFeed({ events, mockMoney, history = false, agentName = "Atlas" }: { events: StatementEvent[]; mockMoney: boolean; history?: boolean; agentName?: string }) {
  const titles: Record<string, string> = {
    "agent.create": `${agentName}’s identity is ready`,
    "ens.records": `${agentName}’s name records are updated`,
    "ens.readonly": `${agentName}’s name is verified`,
    "mandate.grant": "Expiring budget granted",
    "usdc.transfer": `${agentName} sends USDC`,
    "aimorgan.strategize": `${agentName} requests a savings recommendation`,
    "earn.approve": "Exact deposit amount approved",
    "earn.sweep": `${agentName} moves idle money into the approved savings vault`,
  };
  return <article className="timeline panel">
    <div className="section-head"><div><span>{history ? "HISTORY" : "03 / THE ACTIONS"}</span><h3>{history ? "Earlier recorded decisions" : `What ${agentName} does with permission`}</h3><small>Gateway record times · Europe/Rome, not block timestamps</small></div></div>
    {!events.length && <p>Every action leaves a record.</p>}
    <div className="events">{events.filter(event => history || event.status !== "refused").map(event => {
      const eventMock = history ? /MOCK|simulated/i.test(event.reason) : mockMoney;
      const simulated = eventMock && ["usdc.transfer", "earn.approve", "earn.sweep", "aimorgan.strategize"].includes(event.action);
      const reference = event.reference ?? "";
      const proof = /^https:\/\/(tiramisu\.explorer\.arkiv\.network|sepolia\.etherscan\.io)\//.test(reference)
        ? reference : !eventMock && ["usdc.transfer", "earn.approve", "earn.sweep"].includes(event.action) && /^0x[0-9a-fA-F]{64}$/.test(reference)
          ? `https://basescan.org/tx/${reference}` : undefined;
      return <div className="event" key={event.id}>
        <time dateTime={event.at}>{history ? new Date(event.at).toLocaleString("en-GB", { timeZone: "Europe/Rome" }) : new Date(event.at).toLocaleTimeString("en-GB", { timeZone: "Europe/Rome" })}</time><i className={event.status} />
        <div><strong>{event.status === "refused" ? "Refused: " : event.status === "failed" ? "Failed: " : simulated ? "Simulated: " : ""}{titles[event.action] ?? "Gateway decision recorded"}</strong>
          {proof && <a className="proof-chip" title={reference.split("/").at(-1)} href={proof} target="_blank" rel="noreferrer">{event.action === "mandate.grant" ? "Arkiv" : event.action.startsWith("ens.") ? "ENS" : "Base"} ↗</a>}
          <details><summary>Decision details</summary><p>{event.action} · {event.status}</p><p>{event.reason}</p></details>
        </div>
        <span>{event.amountUsdcCents ? `$${(event.amountUsdcCents / 100).toFixed(2)}` : "—"}</span>
      </div>;
    })}</div>
  </article>;
}
