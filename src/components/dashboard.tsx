"use client";

import { useState } from "react";
import type { DemoSnapshot } from "@/core/types";

type DemoResult = { snapshot: DemoSnapshot; steps: string[] };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const short = (value: string, width = 9) =>
  value.length > width * 2 ? `${value.slice(0, width)}…${value.slice(-width)}` : value;

export function Dashboard() {
  const [result, setResult] = useState<DemoResult>();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/demo", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Demo failed.");
      setResult(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Demo failed.");
    } finally {
      setRunning(false);
    }
  }

  const snapshot = result?.snapshot;
  const remaining = snapshot
    ? snapshot.mandate.maxTotalUsdcCents - snapshot.mandate.spentUsdcCents
    : 2_000;
  const refusal = snapshot?.events.findLast((event) => event.status === "refused");

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
            <span>Scripted demo</span>
            <b>02:00</b>
          </div>
          <div className="flow-line">
            <span>CREATE</span><i /><span>PAY</span><i /><span>YIELD</span><i /><span>REFUSE</span>
          </div>
          <button onClick={run} disabled={running}>
            <span>{running ? "Running safeguards…" : snapshot ? "Run again" : "Run the 2-minute mandate"}</span>
            <b>→</b>
          </button>
          <small>Mock mode · deterministic · no external dependency</small>
          {error && <p className="error">{error}</p>}
        </div>
      </section>

      <section className="account-grid">
        <article className="identity-card panel">
          <div className="panel-label">AGENT IDENTITY</div>
          <div className="avatar">A<span>01</span></div>
          <div>
            <h2>{snapshot?.agent.displayName ?? "Atlas"}</h2>
            <p className="ens">{snapshot?.agent.ensName ?? "atlas.agents.unflat.eth"}</p>
          </div>
          <dl>
            <div><dt>PRIVY WALLET</dt><dd>{snapshot ? short(snapshot.agent.walletAddress) : "0x—"}</dd></div>
            <div><dt>IDENTITY RAIL</dt><dd>ENSv2 · Sepolia</dd></div>
          </dl>
        </article>

        <article className="balance-card panel">
          <div className="panel-label">MANDATE BALANCE</div>
          <strong>{money(remaining)}</strong>
          <span>USDC available</span>
          <div className="meter"><i style={{ width: `${(remaining / 2_000) * 100}%` }} /></div>
          <div className="balance-foot">
            <span>Spent {money(snapshot?.mandate.spentUsdcCents ?? 0)}</span>
            <span>Cap $20.00</span>
          </div>
        </article>

        <article className={`mandate-card panel ${snapshot ? "expired" : "active"}`}>
          <div className="panel-label">MANDATE STATE</div>
          <div className="state-line"><i /><strong>{snapshot ? "EXPIRED" : "READY"}</strong></div>
          <p>{snapshot ? "TTL elapsed naturally" : "Awaiting demo run"}</p>
          <dl>
            <div><dt>PER ACTION</dt><dd>$10.00</dd></div>
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
            <b>{snapshot?.events.length ?? 0} EVENTS</b>
          </div>
          <div className="events">
            {(snapshot?.events ?? placeholderEvents).map((event, index) => (
              <div className="event" key={event.id}>
                <time>{new Date(event.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" })}</time>
                <i className={event.status} />
                <div><strong>{event.action}</strong><p>{event.reason}</p></div>
                <span>{event.amountUsdcCents ? money(event.amountUsdcCents) : "—"}</span>
              </div>
            ))}
          </div>
        </article>

        <aside className="security-stack">
          <article className="rail-card panel">
            <div className="section-head"><div><span>YIELD RAIL</span><h3>Idle cash, working.</h3></div><b>BASE</b></div>
            <p className="yield">5.2<sup>%</sup></p>
            <small>Illustrative vault APY</small>
            <div className="vault"><i>UF</i><div><strong>unflat USDC</strong><span>Morpho · via Privy Earn</span></div><b>ALLOWLISTED</b></div>
            <p className="advisory">AIMorgan recommends. unflat decides where real funds go.</p>
          </article>

          <article className="statement-card panel">
            <div className="section-head"><div><span>OWNER RECORD</span><h3>Encrypted on Swarm.</h3></div><b>AES-256</b></div>
            <label>SWARM REFERENCE</label>
            <code>{snapshot ? short(snapshot.statementReference, 12) : "Generated after the run"}</code>
            <label>DECRYPTION KEY</label>
            <code>{snapshot ? short(snapshot.ownerStatementKey, 12) : "Held by owner only"}</code>
            <p>The gateway never persists the key.</p>
          </article>
        </aside>
      </section>

      <footer>
        <span>unflat × agents</span>
        <p>Mandate first. Price validated. Allowlist only.</p>
        <span>Built at ETHRome 2026</span>
      </footer>
    </main>
  );
}

const placeholderEvents = [
  { id: "p1", agentId: "", action: "agent.create", status: "completed" as const, amountUsdcCents: 0, reason: "Ready to create a Privy agent wallet.", at: "2026-10-16T16:00:00Z" },
  { id: "p2", agentId: "", action: "mandate.grant", status: "accepted" as const, amountUsdcCents: 0, reason: "A 2-minute TTL will be written to our store and Arkiv.", at: "2026-10-16T16:00:00Z" },
  { id: "p3", agentId: "", action: "gateway.wait", status: "accepted" as const, amountUsdcCents: 0, reason: "Run the sequence to see the signing boundary close.", at: "2026-10-16T16:00:00Z" },
];

