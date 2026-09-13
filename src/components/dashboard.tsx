"use client";

import { useEffect, useRef, useState } from "react";
import { ActionFeed } from "./action-feed";
import { RefusalResult } from "./refusal-result";
import { ProofFooter } from "./proof-footer";
import { OwnerRecord } from "./owner-record";
import { OwnerControls, type DemoPlan } from "./demo-controls";
import { OwnerLoginLoader } from "./owner-login-loader";
import { DemoStepper } from "./demo-stepper";
import { RealRunStory } from "./real-run-story";
import { ProblemBlock } from "./problem-block";
import { splitRunEvents, mergeEventHistory } from "@/browser/run-events";
import type { DashboardUpdate, DemoMoney } from "@/demo/dashboard-run";
import type { RealRun } from "@/demo/export-real-run";
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

export function Dashboard({ realRuns, ownerModeAvailable, privyAppId }: { realRuns: RealRun[]; ownerModeAvailable: boolean; privyAppId?: string }) {
  const [selectedRun, setSelectedRun] = useState(0);
  const realRun = realRuns[selectedRun];
  const archivedResult: DemoResult = { snapshot: realRun.snapshot, moneyMode: "live", expired: true, phase: "Recorded LIVE run · read-only proof" };
  const [result, setResult] = useState<DemoResult>(archivedResult);
  const [showingRealRun, setShowingRealRun] = useState(true);
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
  const [ownerMode, setOwnerMode] = useState(false);
  const [approvalRequest, setApprovalRequest] = useState<string>();
  const [ownerToken, setOwnerToken] = useState("");
  const [plan, setPlan] = useState<DemoPlan>();
  const [walletAddress, setWalletAddress] = useState("");
  const runLock = useRef(false);

  function showRealRun(index: number) {
    if (runLock.current) return;
    setSelectedRun(index); setShowingRealRun(true); setError(""); setQueryEvidence({});
    setResult({ snapshot: realRuns[index].snapshot, moneyMode: "live", expired: true, phase: "Recorded LIVE run · read-only proof" });
  }

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("request");
    if (ownerModeAvailable && id) { setApprovalRequest(id); setOwnerMode(true); }
  }, [ownerModeAvailable]);

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
    setShowingRealRun(false);
    setPreviousEvents(previous => mergeEventHistory(previous, displayedEvents));
    setRunning(true);
    setError("");
    setLastUpdateAt(Date.now());
    setQueryEvidence({});
    setResult({ moneyMode: mode, phase: "Preparing real Arkiv mandate…" });
    document.getElementById("top")?.scrollIntoView({ behavior: "instant" });
    try {
      const response = await fetch("/api/demo", { method: "POST", headers: { "Content-Type": "application/json", ...(mode === "live" ? { Authorization: `Bearer ${ownerToken}` } : {}) },
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
        <a className="brand" href="#introduction" aria-label="unflat agents home"><span className="brand-mark">u</span> unflat <span className="brand-cross">×</span> agents</a>
        <nav className="chapter-nav" aria-label="Page chapters"><a href="#top">The accounts</a><a href="#refusal-result">The ending</a><a href="#proofs">What is real?</a></nav><div className="header-actions">
          {ownerModeAvailable && <button className="owner-mode-toggle" aria-expanded={ownerMode} aria-controls="owner-access" onClick={() => setOwnerMode(value => !value)}>Owner mode</button>}
          <div className="hack-badge">ETHRome · 40H</div>
        </div>
      </header>
      {ownerModeAvailable && ownerMode && <OwnerLoginLoader appId={privyAppId} requestId={approvalRequest} />}
      <ProblemBlock name={realRun.snapshot.agent.ensName} />
      <section className="hero" id="top">
        <div className="hero-copy"><p className="eyebrow"><span className="section-number">01</span> A BANK ACCOUNT FOR AI AGENTS</p>
          <h1>A bank account.<br /><em>Built to expire.</em></h1>
          <p className="lede">An agent gets a name, a timed budget, yield, and a statement its owner keeps.</p>
          <div className="evidence-intro"><span className="evidence-dot" /><p>{showingRealRun ? "These runs already happened." : "You are watching a simulation."}<br /><strong>{showingRealRun ? "Check every receipt yourself." : "The real runs are one click away."}</strong></p></div>
          <dl className="hero-facts"><div><dt>Real accounts</dt><dd>{realRuns.length.toString().padStart(2, "0")}</dd></div><div><dt>Permission</dt><dd>2 <small>minutes</small></dd></div><div><dt>Revocations</dt><dd>0</dd></div></dl>
        </div>
        <section className="run-panel demo-object" aria-label="Two-minute demo">
          <nav className="real-run-tabs" aria-label="Real runs">
            <button aria-pressed={showingRealRun && selectedRun === 0} disabled={running} onClick={() => showRealRun(0)}>Latest real run · nova</button>
            <button aria-pressed={showingRealRun && selectedRun === 1} disabled={running} onClick={() => showRealRun(1)}>Previous real runs</button>
          </nav>
          <div className="receipt-heading"><span>ACCOUNT / {showingRealRun ? String(selectedRun + 1).padStart(2, "0") : "DEMO"}</span><span>{showingRealRun ? "RECORDED ON BASE" : "SIMULATED MONEY"}</span></div>
          <h2>{showingRealRun ? "Real money. Permission expired." : "Watch a two-minute budget expire."}</h2>
          {showingRealRun && <span className="demo-mode-pill real-run-pill">{realRun.label}</span>}
          {showingRealRun && <div className="run-account-summary">
            <h3>{realRun.snapshot.agent.displayName} <a className="proof-chip" href={`https://explorer.ens.dev/${realRun.snapshot.agent.ensName}`} title={realRun.snapshot.agent.ensName} target="_blank" rel="noreferrer">ENS ↗</a></h3>
            <p>{realRun.snapshot.agent.ensName}</p>
            <p>Owner: {realRun.presentation?.ownerLabel} · {realRun.presentation?.walletOwnership} wallet</p>
            <p>Third-party agent via {realRun.presentation?.client}</p>
            <p className="run-wallet">Wallet: <a href={`https://basescan.org/address/${realRun.snapshot.agent.walletAddress}`} target="_blank" rel="noreferrer">{realRun.snapshot.agent.walletAddress}</a></p>
          </div>}
          {!showingRealRun && result.moneyMode === "live" && <span className="demo-mode-pill real-run-pill">Real money · Base mainnet</span>}
          <DemoStepper key={displayedMandate?.id ?? "ready"} agentName={displayedAgent?.displayName} events={result ? displayedEvents : []} expiresAt={result ? displayedMandate?.expiresAt : undefined}
            confirmedExpired={mandateExpired} running={running} unavailable={!!error} lastUpdateAt={lastUpdateAt} />
          {showingRealRun && <p className="run-budget-left">{money(remaining)} left when permission expired.</p>}
          {!showingRealRun && <button className="back-to-real" disabled={running} onClick={() => showRealRun(selectedRun)}>Back to the real run</button>}
          {ownerModeAvailable && !showingRealRun && result.moneyMode === "live" && mandateExpired && <details><summary>Publish this video take</summary><p>Run <code>npm run export:real-run</code> locally, then commit public/real-run.json and redeploy.</p></details>}
          {error && <div className="demo-error"><p role="alert">Demo interrupted. Review the details before retrying.</p><details><summary>Error details</summary><p>{error}</p></details></div>}
        </section>
      </section>

      <div className="story-content">
        {showingRealRun && <RealRunStory snapshot={realRun.snapshot} />}
        <section className="identity-card panel story-section">
          <p className="panel-label">01 / THE AGENT</p>
          <div className="avatar" aria-hidden="true">{displayedAgent?.displayName?.[0]?.toUpperCase() ?? "A"}<span>01</span></div>
          <div><h2>Meet {displayedAgent?.displayName ?? "Atlas"}</h2><p className="ens">{displayedAgent?.ensName ?? "atlas.agents.unflat.eth"}</p></div>
          <div className="identity-summary">
            <p>{nameVerified ? "Name verified: it points to this agent’s wallet." : displayedAgent?.ensMode === "mock" ? "Simulated identity for this demo." : "Name verification pending."}</p>
            {displayedAgent?.ensName && <a className="proof-chip" title={displayedAgent.ensRegistrationTransaction ?? displayedAgent.ensName} href={displayedAgent.ensExplorerUrl ?? `https://explorer.ens.dev/${displayedAgent.ensName}`} target="_blank" rel="noreferrer">ENS ↗</a>}
            <details><summary>Identity details</summary>
              <p>The same wallet is reused across runs: {short(displayedAgent?.walletAddress ?? walletAddress) || "Loading…"}.</p>
              <p>Wallet: {displayedAgent?.walletAddress}</p><p>Resolved from ENS: {displayedAgent?.ensResolvedAddress ?? "Not resolved"}</p>
              <p>ENSv2 · Sepolia</p>
              {displayedAgent?.ensRegistrationTransaction && <a href={`https://sepolia.etherscan.io/tx/${displayedAgent.ensRegistrationTransaction}`} target="_blank" rel="noreferrer">Registration transaction ↗</a>}
            </details>
          </div>
        </section>

        <section className="story-section panel" id="budget" tabIndex={-1}>
          <p className="panel-label">02 / THE EXPIRING BUDGET</p>
          <h2>{displayedAgent?.displayName ?? "Atlas"} can act for two minutes.</h2>
          <p>Permission ends automatically. The owner does not need to revoke it.</p>
          <div className="budget-layout">
            <article className={`mandate-card ${mandateExpired ? "expired" : "active"}`}>
              <strong className="permission-state">{mandateExpired ? "EXPIRED" : running ? "IN PROGRESS" : "TWO MINUTES"}</strong>
              {displayedMandate?.arkivExplorerUrl && <a className="proof-chip" title={displayedMandate.arkivEntityKey} href={displayedMandate.arkivExplorerUrl} target="_blank" rel="noreferrer">Arkiv ↗</a>}
              <details><summary>Permission details</summary><p>Arkiv entity: {displayedMandate?.arkivEntityKey ?? "Not created yet"}</p>
                <p>Allowed: send USDC, request advice, save in an approved vault. Maximum per action: {money(displayedMandate?.maxPerActionUsdcCents ?? 100)}.</p>
                <p>Expiry block: {displayedMandate?.arkivExpiresAtBlock ?? "—"}. Authorization follows fresh Arkiv queries, not the display clock.</p>
                {result?.query && <p>Block {result.query.blockNumber.toString()} · found={String(result.query.found)}</p>}
              </details>
            </article>
            <article className="balance-card">
              <strong>{money(remaining)}</strong><span>Budget {mandateExpired ? "left when time ran out" : "remaining"}</span>
              <div className="meter"><i style={{ width: `${(remaining / mandateCap) * 100}%` }} /></div>
              <div className="balance-foot"><span>Used {money(displayedMandate?.spentUsdcCents ?? 0)}</span><span>Budget {money(mandateCap)}</span></div>
              <details><summary>Budget details</summary><p>This is permission to use funds, not the wallet balance. Moving money into savings uses budget too.</p></details>
            </article>
          </div>
        </section>

        <ActionFeed events={displayedEvents} mockMoney={mockMoney} agentName={displayedAgent?.displayName} />
        {previousEvents.length > 0 && <details className="story-section previous-runs"><summary>Previous runs</summary>
          <p>Earlier decisions—not actions from the current run.</p>
          <ActionFeed events={previousEvents} mockMoney={false} history />
        </details>}
        <article className="rail-card panel story-section">
          <h3>Idle money can keep working.</h3>
          <p className="rate-inline"><strong>{vaultRate?.apyBasisPoints == null ? "Unavailable" : `${(vaultRate.apyBasisPoints / 100).toFixed(2)}%`}</strong> variable APY · {vaultRate?.source === "morpho-api" ? "Morpho API" : "rate not verified"}</p>
          <p className="risk-note">Variable yield, not a guaranteed return. Funds are exposed to smart contract risk.</p>
          <a className="proof-chip" title={vaultRate?.vault.address} href={`https://basescan.org/address/${vaultRate?.vault.address ?? "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9"}`} target="_blank" rel="noreferrer">Base ↗</a>
          <details><summary>Savings details</summary><p>{vaultRate?.vault.label ?? "Steakhouse Prime USDC"}. {vaultRateError ? "Rate unavailable. No invented fallback." : "Realized six-hour average; not a guaranteed return."}</p><p>{directMorphoLabel}</p><p>{aimorganFeeWaivedLabel}</p><p>AIMorgan recommends. The gateway only deposits into approved vaults.</p></details>
        </article>

        <RefusalResult refusal={refusal} expired={mandateExpired} remaining={remaining} running={running} error={!!error} />

        <OwnerRecord statement={statementAgent && displayedMandate ? {
          agent: statementAgent, mandate: displayedMandate, events: displayedEvents,
          source: mockMoney ? "mock-demo" : "gateway",
        } : undefined} />

        <ProofFooter realRuns={realRuns} liveMoney={result?.moneyMode === "live"} started={!!result} nameVerified={nameVerified} ensName={displayedAgent?.ensName}
          deposit={(mockMoney ? realRun.snapshot.events : displayedEvents).find(event => event.action === "earn.sweep" && event.status === "completed")?.reference}
          showingRealRun={showingRealRun} mandate={displayedMandate} before={queryEvidence.before} after={queryEvidence.after} health={health}>
            {health ? adapters.map(([key, label]) => <p key={key}>{label}: {health.adapters[key].mode.toUpperCase()} — {health.adapters[key].detail}</p>) : <p>{healthError ? "Service status unavailable" : "Reading service status…"}</p>}
            {result && <p>{result.phase}</p>}
        </ProofFooter>
        <section className="story-section simulation-section" aria-label="Try a simulation">
          <h3>Try it without moving money.</h3>
          <button className="simulation-button" onClick={() => void run("mock")} disabled={running}>Run a simulation →</button>
          <span className="demo-mode-pill">Simulated money · live Arkiv</span>
        </section>
      </div>
      <footer><div><span className="footer-wordmark">unflat × agents</span><p>Permission ends.<br />The owner keeps the record.</p></div><div><span>Built at ETHRome 2026</span><p className="risk-note">Hackathon prototype, not a regulated bank or insured deposit. Never fund it with money you cannot afford to lose.</p><a href="https://github.com/alexanderpi007/unflat-agents" target="_blank" rel="noreferrer">Read the source ↗</a></div></footer>
    </main>
  );
}
