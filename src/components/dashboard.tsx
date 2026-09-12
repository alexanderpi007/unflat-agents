"use client";

import { useEffect, useRef, useState } from "react";
import { OwnerRecord } from "./owner-record";
import { DemoControls, type DemoPlan } from "./demo-controls";
import type { DashboardUpdate, DemoMoney } from "@/demo/dashboard-run";
import { aimorganFeeWaivedLabel, directMorphoLabel } from "@/core/labels";
import type {
  Agent,
  DemoSnapshot,
  EarnVaultRate,
  Mandate,
  RuntimeHealth,
  StatementEvent,
  VaultConfig,
} from "@/core/types";

type DemoResult = DashboardUpdate;
type VaultRate = EarnVaultRate & {
  vault: VaultConfig;
};
type LiveState = { agent: Agent; mandate?: Mandate; events: StatementEvent[] };

const adapters = [
  ["privy", "Privy"],
  ["aiMorgan", "AIMorgan"],
  ["arkiv", "Arkiv"],
  ["swarm", "Swarm"],
  ["ens", "ENS"],
] as const;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const short = (value: string, width = 9) =>
  value.length > width * 2 ? `${value.slice(0, width)}…${value.slice(-width)}` : value;

export function Dashboard() {
  const [result, setResult] = useState<DemoResult>();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState("");
  const [vaultRate, setVaultRate] = useState<VaultRate>();
  const [vaultRateError, setVaultRateError] = useState(false);
  const [health, setHealth] = useState<RuntimeHealth>();
  const [healthError, setHealthError] = useState(false);
  const [liveState, setLiveState] = useState<LiveState>();
  const [publicIdentity, setPublicIdentity] = useState<Partial<Agent>>();
  const [localLiveAvailable, setLocalLiveAvailable] = useState(false);
  const [plan, setPlan] = useState<DemoPlan>();
  const [walletAddress, setWalletAddress] = useState("");
  const runLock = useRef(false);

  useEffect(() => {
    setLoadedAt(new Date().toISOString());
    let active = true;
    fetch("/api/vault", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Vault rate unavailable.");
        if (active) setVaultRate(body);
      })
      .catch(() => {
        if (active) setVaultRateError(true);
      });
    fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Runtime health unavailable.");
        if (active) setHealth(body);
      })
      .catch(() => {
        if (active) setHealthError(true);
      });
    fetch("/api/demo", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Live demo state unavailable.");
        if (active && body.state) setLiveState(body.state);
        if (active) {
          setPublicIdentity(body.identity);
          setLocalLiveAvailable(body.localLiveAvailable === true && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname));
          setPlan(body.plan); setWalletAddress(body.walletAddress ?? "");
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function run(mode: DemoMoney, confirmation?: string) {
    if (runLock.current) return;
    runLock.current = true;
    setRunning(true);
    setError("");
    setResult({ moneyMode: mode, phase: "Preparing real Arkiv mandate…" });
    try {
      const response = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, confirmation, runId: crypto.randomUUID() }) });
      if (!response.ok) { const body = await response.json(); throw new Error(`${body.error}: ${body.detail}`); }
      if (!response.body) throw new Error("Demo stream unavailable.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const update = JSON.parse(line) as DashboardUpdate;
          setResult(update);
          if (update.error) throw new Error(`${update.error} ${update.detail}`);
          finished = update.expired === true;
        }
        if (done) break;
      }
      if (!finished) throw new Error("Demo connection ended before expiry proof. Inspect the statement before retrying LIVE.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Demo failed.");
    } finally {
      setRunning(false);
      runLock.current = false;
    }
  }

  const snapshot = result?.snapshot;
  const statementAgent = result ? snapshot?.agent : liveState?.agent;
  const displayedAgent = statementAgent ?? publicIdentity;
  const displayedMandate = result ? snapshot?.mandate : liveState?.mandate;
  const displayedEvents = result ? snapshot?.events ?? [] : liveState?.events ?? [];
  const mandateCap = displayedMandate?.maxTotalUsdcCents ?? 105;
  const remaining = displayedMandate
    ? displayedMandate.maxTotalUsdcCents - displayedMandate.spentUsdcCents
    : mandateCap;
  const refusal = displayedEvents.findLast((event) => event.status === "refused");
  const mandateExpired = result ? result.expired === true : displayedMandate
    ? Date.now() >= new Date(displayedMandate.expiresAt).getTime()
    : false;
  const liveAdapters = health
    ? adapters.filter(([key]) => health.adapters[key].mode === "live").map(([, label]) => label)
    : [];
  const mockAdapters = health
    ? adapters.filter(([key]) => health.adapters[key].mode === "mock").map(([, label]) => label)
    : [];

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="unflat agents home">
          <span className="brand-mark">u</span>
          <span>unflat</span>
          <span className="brand-cross">×</span>
          <span>agents</span>
        </a>
        <div className="network"><i /> Base mainnet <span>/</span> Sepolia identity</div>
        <div className="hack-badge">ETHRome · 40H</div>
      </header>

      <section className="adapter-strip" aria-label="Adapter runtime modes">
        {health
          ? adapters.map(([key, label]) => (
              <span key={key} title={health.adapters[key].detail}>
                {label}: <b className={health.adapters[key].mode}>{health.adapters[key].mode.toUpperCase()}</b>
              </span>
            ))
          : <span>{healthError ? "Adapter health unavailable" : "Reading adapter modes…"}</span>}
      </section>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">CONTROL ROOM / AGENT 01</p>
          <h1>A bank account<br />with an <em>ending.</em></h1>
          <p className="lede">
            The mandate expires. The signer closes. No kill switch, no revocation transaction,
            no forgotten permission living forever.
          </p>
        </div>
        <div className="run-panel">
          <div className="run-head">
            <span>{result ? `${result.moneyMode.toUpperCase()} MONEY · LIVE ARKIV` : "Choose money mode · LIVE ARKIV"}</span>
            <b>02:00</b>
          </div>
          <div className="flow-line">
            <span>CREATE</span><i /><span>PAY</span><i /><span>YIELD</span><i /><span>REFUSE</span>
          </div>
          <DemoControls run={run} running={running} localLiveAvailable={localLiveAvailable} plan={plan} />
          {result && <p role="status">{result.phase}{result.query ? ` · Arkiv block ${result.query.blockNumber} · found=${result.query.found}` : ""}</p>}
          <small>
            {health?.globalMockOverride
              ? "Mock money · live Arkiv and browser Swarm ID"
              : "Per-adapter mode · runtime timestamps"}
          </small>
          <small className="fee-waived">{aimorganFeeWaivedLabel}</small>
          {error && <p className="error">{error}</p>}
        </div>
      </section>

      <section className="account-grid">
        <article className="identity-card panel">
          <div className="panel-label">AGENT IDENTITY</div>
          <div className="avatar">A<span>01</span></div>
          <div>
            <h2>{displayedAgent?.displayName ?? "Atlas"}</h2>
            <p className="ens">{displayedAgent?.ensName ?? "atlas.agents.unflat.eth"}</p>
          </div>
          <dl>
            <div><dt>PERSISTENT PRIVY WALLET</dt><dd title={displayedAgent?.walletAddress ?? walletAddress}>{short(displayedAgent?.walletAddress ?? walletAddress) || "0x—"}</dd></div>
            <div><dt>IDENTITY RAIL</dt><dd>ENSv2 · Sepolia</dd></div>
            <div><dt>ENS RESOLVE-BACK {displayedAgent?.ensMode === "mock" ? "· MOCK" : ""}</dt><dd title={displayedAgent?.ensResolvedAddress ?? ""}>{displayedAgent?.ensResolvedAddress ? short(displayedAgent.ensResolvedAddress) : "Not resolved"}</dd></div>
          </dl>
          {displayedAgent?.ensExplorerUrl && <a href={displayedAgent.ensExplorerUrl} target="_blank" rel="noreferrer">ENS Explorer ↗</a>}
          {displayedAgent?.ensRegistrationTransaction && <a href={`https://sepolia.etherscan.io/tx/${displayedAgent.ensRegistrationTransaction}`} target="_blank" rel="noreferrer">Registration transaction ↗</a>}
        </article>

        <article className="balance-card panel">
          <div className="panel-label">MANDATE BALANCE</div>
          <strong>{money(remaining)}</strong>
          <span>USDC available</span>
          <div className="meter"><i style={{ width: `${(remaining / mandateCap) * 100}%` }} /></div>
          <div className="balance-foot">
            <span>Spent {money(displayedMandate?.spentUsdcCents ?? 0)}</span>
            <span>Cap {money(mandateCap)}</span>
          </div>
        </article>

        <article className={`mandate-card panel ${mandateExpired ? "expired" : "active"}`}>
          <div className="panel-label">MANDATE STATE</div>
          <div className="state-line"><i /><strong>{mandateExpired ? "EXPIRED" : displayedMandate ? "ACTIVE" : "READY"}</strong></div>
          <p>{mandateExpired ? "Arkiv query empty · TTL elapsed naturally" : displayedMandate ? `Estimated expiry ${new Date(displayedMandate.expiresAt).toLocaleTimeString()} · authorization follows Arkiv blocks` : "Awaiting demo run"}</p>
          {displayedMandate?.arkivExplorerUrl && (
            <a href={displayedMandate.arkivExplorerUrl} target="_blank" rel="noreferrer">
              Arkiv entity {short(displayedMandate.arkivEntityKey ?? "", 7)} ↗
            </a>
          )}
          <dl>
            <div><dt>PER ACTION</dt><dd>{money(displayedMandate?.maxPerActionUsdcCents ?? 100)}</dd></div>
            <div><dt>REVOCATION TX</dt><dd>None</dd></div>
          </dl>
        </article>
      </section>

      {refusal && (
        <section className="refusal" role="status">
          <div className="stop-icon">×</div>
          <div><span>GATEWAY DECISION</span><strong>Action refused</strong></div>
          <p>{refusal.reason}</p>
          <code>HTTP 403 / MANDATE_EXPIRED</code>
        </section>
      )}

      <section className="lower-grid">
        <article className="timeline panel">
          <div className="section-head">
            <div><span>STATEMENT</span><h3>Every decision, readable.</h3></div>
            <b>{displayedEvents.length} EVENTS</b>
          </div>
          <div className="events">
            {(displayedEvents.length ? displayedEvents : placeholderEvents(loadedAt)).map((event) => (
              <div className="event" key={event.id}>
                <time>{event.at ? new Date(event.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) : "--:--:--"}</time>
                <i className={event.status} />
                <div>
                  <strong>{event.action}</strong><p>{event.reason}</p>
                  {event.reference?.startsWith("https://sepolia.etherscan.io/tx/") && <a href={event.reference} target="_blank" rel="noreferrer">ENS transaction · Sepolia ↗</a>}
                  {result?.moneyMode !== "mock" && !event.action.startsWith("ens.") && event.action !== "agent.create" && /^0x[0-9a-fA-F]{64}$/.test(event.reference ?? "") && (
                    <a href={`https://basescan.org/tx/${event.reference}`} target="_blank" rel="noreferrer">
                      {short(event.reference!, 10)} · BaseScan ↗
                    </a>
                  )}
                </div>
                <span>{event.amountUsdcCents ? money(event.amountUsdcCents) : "—"}</span>
              </div>
            ))}
          </div>
        </article>

        <aside className="security-stack">
          <article className="rail-card panel">
            <div className="section-head"><div><span>YIELD RAIL</span><h3>Idle cash, working.</h3></div><b>BASE</b></div>
            <p className="yield">
              {vaultRate?.apyBasisPoints == null ? "—" : (vaultRate.apyBasisPoints / 100).toFixed(2)}
              {vaultRate?.apyBasisPoints != null && <sup>%</sup>}
            </p>
            <small>
              {vaultRateError
                ? "Vault APY unavailable — no fallback substituted"
                : vaultRate?.source === "morpho-api"
                  ? `Live realized six-hour average APY · ${vaultRate.provider} API`
                  : vaultRate?.source === "mock-unavailable"
                    ? "MOCK — live Morpho APY unavailable; no number substituted"
                    : "Reading allowlisted Morpho vault…"}
            </small>
            <div className="vault"><i>UF</i><div><strong>{vaultRate?.vault.label ?? "Steakhouse Prime USDC"}</strong><span>{vaultRate?.vault.execution === "privy-earn-api" ? "Morpho · via Privy Earn API" : directMorphoLabel}</span></div><b>ALLOWLISTED</b></div>
            <p className="advisory">AIMorgan recommends. unflat decides where real funds go.</p>
          </article>

          <OwnerRecord statement={statementAgent && displayedMandate ? {
            agent: statementAgent, mandate: displayedMandate, events: displayedEvents,
            source: result?.moneyMode === "mock" ? "mock-demo" : "gateway",
          } : undefined} />
        </aside>
      </section>

      <footer>
        <span>unflat × agents</span>
        <p>
          {health
            ? `Live: ${liveAdapters.join(", ") || "none"} · Mock: ${mockAdapters.join(", ") || "none"} · Swarm ID: owner connects in browser`
            : "Mandate first. Price validated. Allowlist only."}
        </p>
        <span>Built at ETHRome 2026</span>
      </footer>
    </main>
  );
}

const placeholderEvents = (at: string): StatementEvent[] => [
  { id: "p1", agentId: "", action: "agent.create", status: "completed" as const, amountUsdcCents: 0, reason: "Ready to create a Privy agent wallet.", at },
  { id: "p2", agentId: "", action: "mandate.grant", status: "accepted" as const, amountUsdcCents: 0, reason: "A 2-minute TTL will be written to our store and Arkiv.", at },
  { id: "p3", agentId: "", action: "gateway.wait", status: "accepted" as const, amountUsdcCents: 0, reason: "Run the sequence to see the signing boundary close.", at },
];
