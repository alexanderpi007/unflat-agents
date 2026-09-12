"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { DemoPlan } from "./demo-controls";

const sessionKey = "unflat-owner-token";
type Queue = DemoPlan & { moneyMode: string; pending: { id: string; purpose: string; agentId: string }[] };

export function OwnerAccess({ children, onSession }: {
  children: ReactNode; onSession: (token: string, plan?: DemoPlan) => void;
}) {
  const [token, setToken] = useState("");
  const [input, setInput] = useState("");
  const [queue, setQueue] = useState<Queue>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const lock = useRef(false);
  const generation = useRef(0);
  const sessionCallback = useRef(onSession);
  sessionCallback.current = onSession;

  const refresh = useCallback(async (credential: string, signal?: AbortSignal) => {
    const started = generation.current;
    const response = await fetch("/api/owner/approvals", { headers: { Authorization: `Bearer ${credential}` }, cache: "no-store", signal });
    if (!response.ok) throw new Error("Owner access unavailable. Check OWNER_TOKEN and the gateway connection.");
    const body = await response.json() as Queue;
    if (signal?.aborted || generation.current !== started) return;
    setQueue(body); setToken(credential); sessionCallback.current(credential, body);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let stored: string | null = null;
    try { stored = sessionStorage.getItem(sessionKey); } catch { /* Login can still use in-memory state. */ }
    if (stored) void refresh(stored, controller.signal).catch(() => {
      if (!controller.signal.aborted) setError("Session expired. Enter the owner token again.");
    });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    let loading = false;
    const timer = setInterval(() => {
      if (loading || lock.current) return;
      loading = true;
      void refresh(token, controller.signal).catch(() => {
        if (!controller.signal.aborted) { setQueue(undefined); setError("Cannot refresh approvals. Reconnect before approving."); }
      }).finally(() => { loading = false; });
    }, 5000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [token, refresh]);

  async function login() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await refresh(input.trim());
      try { sessionStorage.setItem(sessionKey, input.trim()); } catch { /* This tab remains authenticated in memory. */ }
      setInput("");
    } catch { setError("Owner access unavailable. Use OWNER_TOKEN, not the agent token."); }
    finally { setBusy(false); lock.current = false; }
  }

  async function decide(id: string, action: "approve" | "deny") {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/owner/approvals", { method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, confirmation: confirmations[id] }) });
      if (!response.ok) throw new Error("Request was not completed. Inspect its status before retrying; approval requires CONFIRM.");
      setConfirmations({});
      setNotice(action === "approve" ? "Approved. The agent has two minutes to act." : "Denied. No permission granted.");
      await refresh(token);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Approval unavailable."); }
    finally { setBusy(false); lock.current = false; }
  }

  return <section id="owner-access" aria-label="Owner access">
    <div className="owner-money-card">
      {!token ? <form onSubmit={event => { event.preventDefault(); void login(); }}>
        <h2>Owner sign in</h2><p>Use your owner token. It stays in this browser tab’s session.</p>
        <label htmlFor="owner-token">Owner token</label>
        <input id="owner-token" type="password" value={input} onChange={event => setInput(event.target.value)} autoComplete="off" spellCheck={false} />
        <button disabled={busy || !input.trim()}>Unlock Owner mode</button>
      </form> : <><p>Owner authenticated · {queue?.moneyMode === "live" ? "agent actions use real Base money" : "agent actions use mock money"}</p>
        <button disabled={busy} onClick={() => {
          generation.current++;
          try { sessionStorage.removeItem(sessionKey); } catch { /* Memory-only session. */ }
          setToken(""); setQueue(undefined); setConfirmations({}); setNotice(""); sessionCallback.current("");
        }}>Sign out owner</button>
        <h2>Owner approvals</h2>
        {queue?.pending.length === 0 && <p>No pending requests. Ask the agent to call request_mandate.</p>}
        {queue?.pending.map(request => <article key={request.id}>
          <h3>Agent request</h3><p>{request.purpose}</p>
          <p>2 minutes · $1.20 total cap · $1.00 per action · {queue.moneyMode === "live" ? "Base mainnet + gas" : "mock money"}</p>
          <details><summary>Approval details</summary><p>Agent: {request.agentId}</p><p>Each pay sends 0.05 USDC to {queue.recipient}. Save deposits 1.00 USDC into {queue.vault}. Advice is fee-waived. The agent may repeat actions within the $1.20 cap.</p></details>
          <label htmlFor={`approve-${request.id}`}>Type CONFIRM to approve this budget</label>
          <input id={`approve-${request.id}`} autoComplete="off" value={confirmations[request.id] ?? ""}
            onChange={event => setConfirmations(previous => ({ ...previous, [request.id]: event.target.value }))} />
          <button disabled={busy || confirmations[request.id] !== "CONFIRM"} onClick={() => void decide(request.id, "approve")}>Approve (2 minutes, $1.20 cap)</button>
          <button disabled={busy} onClick={() => void decide(request.id, "deny")}>Deny</button>
        </article>)}
      </>}
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    </div>
    {token && children}
  </section>;
}
