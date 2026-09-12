"use client";

import { useEffect, useRef, useState } from "react";
import { ActionFeed } from "./action-feed";
import { MandateTimer } from "./mandate-timer";
import { RefusalResult } from "./refusal-result";
import { ProofFooter } from "./proof-footer";
import { OwnerRecord } from "./owner-record";
import { OwnerControls, type DemoPlan } from "./demo-controls";
import { DemoStepper } from "./demo-stepper";
import { splitRunEvents, mergeEventHistory } from "@/browser/run-events";
import type { DashboardUpdate, DemoMoney } from "@/demo/dashboard-run";
import { aimorganFeeWaivedLabel, directMorphoLabel } from "@/core/labels";
import type {
  Agent,
  ArkivMandateQuery,
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
  const [lastUpdateAt, setLastUpdateAt] = useState<number>();
  const [queryEvidence, setQueryEvidence] = useState<{ before?: ArkivMandateQuery; after?: ArkivMandateQuery }>({});
  const [vaultRate, setVaultRate] = useState<VaultRate>();
  const [vaultRateError, setVaultRateError] = useState(false);
  const [health, setHealth] = useState<RuntimeHealth>();
  const [healthError, setHealthError] = useState(false);
  const [liveState, setLiveState] = useState<LiveState>();
  const [previousEvents, setPreviousEvents] = useState<StatementEvent[]>([]);
  const [publicIdentity, setPublicIdentity] = useState<Partial<Agent>>();
  const [localLiveAvailable, setLocalLiveAvailable] = useState(false);
  const [ownerMode, setOwnerMode] = useState(false);
  const [plan, setPlan] = useState<DemoPlan>();
  const [walletAddress, setWalletAddress] = useState("");
  const runLock = useRef(false);

  useEffect(() => {
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
        if (active && body.state) {
          const partition = splitRunEvents(body.state.events, body.state.mandate);
          setLiveState({ ...body.state, events: partition.current });
          setPreviousEvents(previous => mergeEventHistory(previous, partition.previous));
        }
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
    setPreviousEvents(previous => mergeEventHistory(previous, displayedEvents));
    setRunning(true);
    setError("");
    setLastUpdateAt(Date.now());
    setQueryEvidence({});
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
          setResult(previous => update.error ? { ...previous, ...update, snapshot: update.snapshot ?? previous?.snapshot } : update);
          setLastUpdateAt(Date.now());
          if (update.query) {
            const query = update.query;
            setQueryEvidence(previous => query.found ? { ...previous, before: previous.before ?? query } : { ...previous, after: query });
          }
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
  const mandateCap = displayedMandate?.maxTotalUsdcCents ?? 120;
  const remaining = displayedMandate
    ? displayedMandate.maxTotalUsdcCents - displayedMandate.spentUsdcCents
    : mandateCap;
  const refusal = displayedEvents.findLast((event) => event.status === "refused");
  const mandateExpired = result?.expired === true;
  const mockMoney = result ? result.moneyMode === "mock" : !liveState;
  const nameVerified = displayedAgent?.ensMode === "live" && !!displayedAgent?.ensResolvedAddress
    && displayedAgent.ensResolvedAddress.toLowerCase() === displayedAgent.walletAddress?.toLowerCase();

  return (
    <main className="story-page">
      <a className="skip-link" href="#budget">Skip to the expiring budget</a>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="unflat agents home"><span className="brand-mark">u</span> unflat <span className="brand-cross">×</span> agents</a>
        <a href="#proofs">What is real?</a><div className="header-actions">
          {localLiveAvailable && <button className="owner-mode-toggle" aria-expanded={ownerMode} aria-controls="owner-money" onClick={() => setOwnerMode(value => !value)}>Owner mode</button>}
          <div className="hack-badge">ETHRome · 40H</div>
        </div>
      </header>
      {localLiveAvailable && ownerMode && <OwnerControls run={run} running={running} plan={plan} />}
      <section className="hero" id="top">
        <div><p className="eyebrow">A BANK ACCOUNT FOR AI AGENTS</p>
          <h1>A name. A budget.<br />An <em>expiry.</em></h1>
          <p className="lede">An agent gets a bank account with a name, a budget that expires, yield on idle funds, and a statement its owner keeps. When time runs out, the next action is refused. Nobody revokes anything.</p>
        </div>
        <section className="run-panel demo-object" aria-label="Two-minute demo">
          <h2>Watch a two-minute budget expire.</h2>
          <button onClick={() => void run("mock")} disabled={running}>Run the demo →</button>
          <span className="demo-mode-pill">{result?.moneyMode === "live" ? "Real money · live Arkiv" : "Simulated money · live Arkiv"}</span>
          <DemoStepper events={result ? displayedEvents : []} expiresAt={result ? displayedMandate?.expiresAt : undefined}
            confirmedExpired={mandateExpired} running={running} unavailable={!!error} lastUpdateAt={lastUpdateAt} />
          {error && <div className="demo-error"><p role="alert">Demo interrupted. Review the details before retrying.</p><details><summary>Error details</summary><p>{error}</p></details></div>}
        </section>
      </section>

      <div className="story-content">
        <section className="identity-card panel story-section">
          <p className="panel-label">01 / THE AGENT</p>
          <div className="avatar" aria-hidden="true">A<span>01</span></div>
          <div><h2>Meet {displayedAgent?.displayName ?? "Atlas"}</h2><p className="ens">{displayedAgent?.ensName ?? "atlas.agents.unflat.eth"}</p></div>
          <div className="identity-summary">
            <p>{nameVerified ? "Name verified: it points to Atlas’s wallet." : displayedAgent?.ensMode === "mock" ? "Simulated identity for this demo." : "Name verification pending."}</p>
            <p>Wallet: {short(displayedAgent?.walletAddress ?? walletAddress) || "Loading…"} · The same wallet is reused across dashboard runs.</p>
            {displayedAgent?.ensExplorerUrl && <a href={displayedAgent.ensExplorerUrl} target="_blank" rel="noreferrer">View ENS proof ↗</a>}
            <details><summary>Identity details</summary>
              <p>Wallet: {displayedAgent?.walletAddress}</p><p>Resolved from ENS: {displayedAgent?.ensResolvedAddress ?? "Not resolved"}</p>
              <p>ENSv2 · Sepolia</p>
              {displayedAgent?.ensRegistrationTransaction && <a href={`https://sepolia.etherscan.io/tx/${displayedAgent.ensRegistrationTransaction}`} target="_blank" rel="noreferrer">Registration transaction ↗</a>}
            </details>
          </div>
        </section>

        <section className="story-section panel" id="budget" tabIndex={-1}>
          <p className="panel-label">02 / THE EXPIRING BUDGET</p>
          <h2>Atlas can act for two minutes.</h2>
          <p>Permission ends automatically. The owner does not need to revoke it.</p>
          <div className="budget-layout">
            <article className={`mandate-card ${mandateExpired ? "expired" : "active"}`}>
              <MandateTimer expiresAt={displayedMandate?.expiresAt} confirmedExpired={mandateExpired}
                running={running} unavailable={!!error} lastUpdateAt={lastUpdateAt} />
              <p>Allowed: send USDC, request advice, deposit into an approved savings vault.</p>
              <p>Maximum per action: {money(displayedMandate?.maxPerActionUsdcCents ?? 100)}.</p>
              {displayedMandate?.arkivExplorerUrl && <a href={displayedMandate.arkivExplorerUrl} target="_blank" rel="noreferrer">View expiring permission ↗</a>}
              <details><summary>Permission details</summary><p>Arkiv entity: {displayedMandate?.arkivEntityKey ?? "Not created yet"}</p>
                <p>Expiry block: {displayedMandate?.arkivExpiresAtBlock ?? "—"}. Authorization follows fresh Arkiv queries, not the display clock.</p>
                {result?.query && <p>Block {result.query.blockNumber.toString()} · found={String(result.query.found)}</p>}
              </details>
            </article>
            <article className="balance-card">
              <strong>{money(remaining)}</strong><span>Budget {mandateExpired ? "left when time ran out" : "remaining"}</span>
              <div className="meter"><i style={{ width: `${(remaining / mandateCap) * 100}%` }} /></div>
              <div className="balance-foot"><span>Used {money(displayedMandate?.spentUsdcCents ?? 0)}</span><span>Budget {money(mandateCap)}</span></div>
              <p>This is permission to use funds, not the wallet balance. Moving money into savings uses budget too.</p>
            </article>
          </div>
        </section>

        <ActionFeed events={displayedEvents} mockMoney={mockMoney} />
        {previousEvents.length > 0 && <details className="story-section previous-runs"><summary>Previous runs</summary>
          <p>Earlier decisions—not actions from the current run.</p>
          <ActionFeed events={previousEvents} mockMoney={false} history />
        </details>}
        <article className="rail-card panel story-section">
          <h3>Idle money can keep working.</h3>
          <p>Atlas’s approved savings vault: {vaultRate?.vault.label ?? "Steakhouse Prime USDC"}.</p>
          <p className="rate-inline">Variable annualized rate: <strong>{vaultRate?.apyBasisPoints == null ? "Unavailable" : `${(vaultRate.apyBasisPoints / 100).toFixed(2)}%`}</strong></p>
          <p>{vaultRate?.source === "morpho-api" ? "Source: Morpho API · realized six-hour average. Not a guaranteed return." : vaultRateError ? "Rate unavailable. No invented fallback." : "No live rate verified yet."}</p>
          <details><summary>Savings details</summary><p>{directMorphoLabel}</p><p>{aimorganFeeWaivedLabel}</p><p>AIMorgan recommends. The gateway only deposits into approved vaults.</p></details>
        </article>

        <RefusalResult refusal={refusal} expired={mandateExpired} remaining={remaining} running={running} error={!!error} />

        <OwnerRecord statement={statementAgent && displayedMandate ? {
          agent: statementAgent, mandate: displayedMandate, events: displayedEvents,
          source: mockMoney ? "mock-demo" : "gateway",
        } : undefined} />

        <ProofFooter liveMoney={result?.moneyMode === "live"} started={!!result} nameVerified={nameVerified}
          mandate={displayedMandate} before={queryEvidence.before} after={queryEvidence.after} health={health}>
            {health ? adapters.map(([key, label]) => <p key={key}>{label}: {health.adapters[key].mode.toUpperCase()} — {health.adapters[key].detail}</p>) : <p>{healthError ? "Service status unavailable" : "Reading service status…"}</p>}
            {result && <p>{result.phase}</p>}
        </ProofFooter>
      </div>
      <footer><span>unflat × agents</span><p>Permission ends. The owner keeps the record.</p><span>Built at ETHRome 2026</span></footer>
    </main>
  );
}
