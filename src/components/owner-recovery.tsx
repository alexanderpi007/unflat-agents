"use client";

import { useRef, useState } from "react";

export function OwnerRecovery({ accountId, token, vault, moneyMode }: { accountId: string; token: string; vault?: string; moneyMode: string }) {
  const [action, setAction] = useState("earn.recall");
  const [shares, setShares] = useState("");
  const [recipient, setRecipient] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState("");
  const [hash, setHash] = useState("");
  const lock = useRef(false);
  async function submit() {
    if (lock.current || confirmation !== "CONFIRM") return;
    lock.current = true; setBusy(true); setDetail(""); setHash("");
    try {
      const response = await fetch("/api/owner/recovery", { method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, action, confirmation, requestId: crypto.randomUUID(),
          ...(action === "earn.recall" ? { sharesRaw: shares, vaultAddress: vault } : { recipient, amountUsdcCents: 100 }) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail ?? "Recovery unavailable. Inspect the statement before retrying.");
      setHash(result.transactionHash); setConfirmation("");
      setDetail(action === "earn.recall" ? `Recalled ${result.sharesRedeemedRaw} raw shares; received ${result.assetsReceivedRaw} raw USDC units into this wallet.` : "Transferred 1.00 USDC to your confirmed address.");
    } catch (error) { setDetail(error instanceof Error ? error.message : "Recovery unavailable; inspect the statement before retrying."); }
    finally { setBusy(false); lock.current = false; }
  }
  return <details><summary>Owner recovery through the gateway</summary>
    <p>{moneyMode === "live" ? "REAL Base money + gas" : "MOCK money"}. First use Grant budget above: two minutes, $1.20 cap. Owner-only actions still require a live mandate and price validation.</p>
    <label htmlFor={`recover-action-${accountId}`}>Recovery action</label>
    <select id={`recover-action-${accountId}`} disabled={busy} value={action} onChange={e => { setAction(e.target.value); setConfirmation(""); }}>
      <option value="earn.recall">Recall vault shares into this wallet</option><option value="owner.transfer">Transfer 1.00 USDC to my external wallet</option>
    </select>
    {action === "earn.recall" ? <><p>Vault: {vault}. No new approval. Recall does not consume the spending cap.</p>
      <label htmlFor={`shares-${accountId}`}>Raw vault shares (from deposit receipt)</label>
      <input id={`shares-${accountId}`} disabled={busy} inputMode="numeric" value={shares} onChange={e => { setShares(e.target.value); setConfirmation(""); }} /></>
      : <><label htmlFor={`recipient-${accountId}`}>My external Base address</label>
        <input id={`recipient-${accountId}`} disabled={busy} value={recipient} onChange={e => { setRecipient(e.target.value); setConfirmation(""); }} />
        <p>Review the full destination. This address is chosen by you, not verified against your email.</p></>}
    <label htmlFor={`recovery-confirm-${accountId}`}>Type CONFIRM for this recovery</label>
    <input id={`recovery-confirm-${accountId}`} disabled={busy} autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} />
    <button disabled={busy || confirmation !== "CONFIRM"} onClick={() => void submit()}>Execute owner recovery</button>
    {detail && <p role="status">{detail}</p>}
    {hash && (moneyMode === "live" ? <a href={`https://basescan.org/tx/${hash}`} target="_blank" rel="noreferrer">Base ↗ {hash}</a> : <p>Simulated: {hash}</p>)}
  </details>;
}
