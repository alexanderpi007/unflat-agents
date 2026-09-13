"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { DemoPlan } from "./demo-controls";
import { OwnerAccounts } from "./owner-accounts";
import { chainConfig, type AccountChain } from "@/core/chains";

type Queue = DemoPlan & { moneyMode: string; request?: { id: string; status: string } | null; pending: { id: string; name?: string; chain?: AccountChain; purpose: string; agentId: string }[] };

export function OwnerAccess({ children, onSession, requestId, credential, email, onLogout }: {
  children?: ReactNode; requestId?: string; credential: string; email: string; onLogout: () => void; onSession: (token: string, plan?: DemoPlan) => void;
}) {
  const [token, setToken] = useState("");
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
    const response = await fetch(`/api/owner/approvals${requestId ? `?request=${encodeURIComponent(requestId)}` : ""}`, { headers: { Authorization: `Bearer ${credential}` }, cache: "no-store", signal });
    if (!response.ok) throw new Error("Owner access unavailable. Log in with the account owner's email.");
    const body = await response.json() as Queue;
    if (signal?.aborted || generation.current !== started) return;
    setQueue(body); setToken(credential); sessionCallback.current(credential, body);
  }, [requestId]);

  useEffect(() => {
    generation.current++;
    setToken(""); setQueue(undefined); setConfirmations({}); setNotice(""); setError("");
    const controller = new AbortController();
    if (credential) void refresh(credential, controller.signal).catch(() => {
      if (!controller.signal.aborted) { setToken(""); setQueue(undefined); setError("Owner access unavailable. Log in with the account owner's email."); }
    });
    return () => controller.abort();
  }, [refresh, credential]);

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

  async function decide(id: string, action: "approve" | "deny") {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/owner/approvals", { method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, confirmation: confirmations[id] }) });
      if (!response.ok) throw new Error("Request was not completed. Inspect its status before retrying; approval requires CONFIRM.");
      setConfirmations({});
      setNotice(action === "approve" ? (requestId ? "Approved — your agent can act for 2 minutes" : "Approved. The agent has two minutes to act.") : "Denied. No permission granted.");
      await refresh(token);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Approval unavailable."); }
    finally { setBusy(false); lock.current = false; }
  }

  return <section id="owner-access" aria-label="Owner access">
    <div className="owner-money-card">
      <p>Signed in with Privy: {email}</p>
        <button disabled={busy} onClick={() => {
          generation.current++;
          setToken(""); setQueue(undefined); setConfirmations({}); setNotice(""); sessionCallback.current(""); onLogout();
        }}>Sign out owner</button>
      {!token ? <p>Verifying owner access…</p> : <><p>Owner authenticated · {queue?.moneyMode === "live" ? "on-chain actions; check each account's chain below" : "agent actions use mock money"}</p>
        <h2>Owner approvals</h2>
        {requestId && queue?.request?.status === "approved" && !notice && <p role="status">Approved — a budget was granted. Its original expiry still applies; approval status does not renew it.</p>}
        {requestId && queue && !queue.request && <p>Request not found. Check the link with your agent; nothing was approved.</p>}
        {requestId && queue?.request && queue.request.status !== "pending" && queue.request.status !== "approved" && <p>Request status: {queue.request.status}. No new permission granted.</p>}
        {!requestId && queue?.pending.length === 0 && <p>No pending requests. Ask the agent to call request_mandate.</p>}
        {queue?.pending.filter(request => !requestId || request.id === requestId).map(request => <article key={request.id}>
          <h3>{request.name ?? request.agentId}</h3><p>{request.purpose}</p>
          <p>2 minutes · $1.20 total cap · $1.00 per action · {queue.moneyMode === "live" ? `${chainConfig(request.chain).label} + ${chainConfig(request.chain).gasSymbol} gas` : "mock money"}</p>
          <details><summary>Approval details</summary><p>Agent: {request.agentId}</p><p>The standard demo pays 0.05 USDC to {queue.recipient}; {request.chain === "avalanche-fuji" ? "Fuji test tokens only; savings and advice are not supported on this chain." : `saves 1.00 USDC into ${queue.vault}.`} The gateway enforces the cap. Money follows the server mode and account chain shown above.</p></details>
          <label htmlFor={`approve-${request.id}`}>Type CONFIRM to approve this budget</label>
          <input id={`approve-${request.id}`} autoComplete="off" value={confirmations[request.id] ?? ""}
            onChange={event => setConfirmations(previous => ({ ...previous, [request.id]: event.target.value }))} />
          <button disabled={busy || confirmations[request.id] !== "CONFIRM"} onClick={() => void decide(request.id, "approve")}>Approve (2 minutes, $1.20 cap)</button>
          <button disabled={busy} onClick={() => void decide(request.id, "deny")}>Deny</button>
        </article>)}
        {!requestId && <OwnerAccounts token={token} onGranted={() => { void refresh(token).catch(() => setError("Refresh approvals to check the new grant.")); }} />}
      </>}
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    </div>
    {token && !requestId && children}
  </section>;
}
