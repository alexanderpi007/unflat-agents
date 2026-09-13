"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OwnerRecovery } from "./owner-recovery";

type Row = { id: string; name: string; fundingAddress: string | null; status: string; ownerEmail?: string | null; ownership?: string; ownerPortalUrl?: string;
  balance: { amountUsdcCents: number } | null; mandate: { allowed: boolean; reason: string }; ensExplorerUrl: string };
type Accounts = { accounts: Row[]; moneyMode: string; recipient?: string; vault?: string };

export function OwnerAccounts({ token, onGranted }: { token: string; onGranted: () => void }) {
  const [data, setData] = useState<Accounts>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/owner/accounts", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal });
    if (!response.ok) throw new Error("Accounts unavailable. Refresh before granting a budget.");
    const body = await response.json() as Accounts;
    if (!signal?.aborted) { setData(body); setError(""); }
  }, [token]);
  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    const update = () => {
      if (loading || lock.current) return;
      loading = true;
      void refresh(controller.signal).catch(() => {
        if (!controller.signal.aborted) { setData(undefined); setError("Accounts unavailable. Try refreshing."); }
      }).finally(() => { loading = false; });
    };
    update(); const timer = setInterval(update, 15_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [refresh]);

  async function grant(accountId: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/owner/accounts", { method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, requestId: crypto.randomUUID(), confirmation: confirmations[accountId] }) });
      if (!response.ok) throw new Error("Grant not completed. Inspect this account's mandate before retrying.");
      setConfirmations({}); setNotice("Budget granted for this account. It expires in two minutes.");
      onGranted(); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Grant unavailable."); }
    finally { setBusy(false); lock.current = false; }
  }
  return <section aria-label="Owner accounts">
    <h2>Your accounts</h2>
    <p>Fund only ready, live accounts with Base USDC and ETH for gas. Funding does not grant permission.</p>
    {data && <p>{data.moneyMode === "live" ? "Real Base balances" : "Mock balances · do not fund mock addresses"}</p>}
    {data?.accounts.length === 0 && <p>No accounts yet. Agents enroll with get_account and a new name.</p>}
    {data?.accounts.map(account => <article key={account.id}>
      <h3>{account.name}</h3>
      <p>{account.ownership === "privy-user" ? `Owner-owned · ${account.ownerEmail}` : "App-owned · legacy (unchanged)"}</p>
      {account.ownership === "privy-user" && <a href={account.ownerPortalUrl ?? "/owner-wallet"} target="_blank" rel="noreferrer">Log in on Privy to withdraw or revoke ↗</a>}
      <p>{account.balance ? `$${(account.balance.amountUsdcCents / 100).toFixed(2)} USDC` : "Balance unavailable"} · {account.status}</p>
      {account.status !== "ready" && <p>Do not fund: provisioning is incomplete. Ask the gateway operator to inspect it.</p>}
      {account.fundingAddress && <><p>Funding address: <code>{account.fundingAddress}</code></p>
        <a href={`https://basescan.org/address/${account.fundingAddress}`} target="_blank" rel="noreferrer">Base ↗</a> · <a href={account.ensExplorerUrl} target="_blank" rel="noreferrer">ENS ↗</a></>}
      <p>{account.mandate.allowed ? "Budget active" : "No active spending permission"}</p>
      <details><summary>Grant details</summary><p>{account.mandate.reason}</p><p>Two minutes, $1.20 total cap, $1.00 per action. Pay 0.05 USDC to {data.recipient}; save 1.00 USDC into {data.vault}. Repeated actions allowed within the cap; plus Base gas when live.</p><p>For owner-owned accounts this also enables owner-only recall and transfer. Each recovery still needs its own CONFIRM. Recall returns funds to this wallet without consuming the cap.</p></details>
      <label htmlFor={`grant-${account.id}`}>Type CONFIRM for {account.name}</label>
      <input id={`grant-${account.id}`} autoComplete="off" value={confirmations[account.id] ?? ""}
        onChange={event => setConfirmations(previous => ({ ...previous, [account.id]: event.target.value }))} />
      <button disabled={busy || account.status !== "ready" || confirmations[account.id] !== "CONFIRM"} onClick={() => void grant(account.id)}>Grant budget to {account.name}</button>
      {account.ownership === "privy-user" && account.status === "ready" && <OwnerRecovery accountId={account.id} token={token} vault={data.vault} moneyMode={data.moneyMode} />}
    </article>)}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
