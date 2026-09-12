"use client";

import { useEffect, useState } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { base } from "viem/chains";
import { OwnerAccess } from "./owner-access";

export default function OwnerLogin({ appId, requestId }: { appId: string; requestId?: string }) {
  useEffect(() => {
    // Discard credentials saved by the retired operator-login UI without reading them.
    try { sessionStorage.removeItem("unflat-owner-token"); } catch { /* Storage may be disabled. */ }
  }, []);
  return <PrivyProvider appId={appId} config={{ loginMethods: ["email"], defaultChain: base, supportedChains: [base],
    embeddedWallets: { ethereum: { createOnLogin: "off" } } }}><Session requestId={requestId} /></PrivyProvider>;
}
function Session({ requestId }: { requestId?: string }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const [credential, setCredential] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try { const token = authenticated ? await getAccessToken() : null; if (active) { setCredential(token ?? ""); setError(""); } }
      catch { if (active) { setCredential(""); setError("Privy session unavailable. Log in again."); } }
    };
    void refresh(); const interval = setInterval(() => void refresh(), 30_000);
    return () => { active = false; clearInterval(interval); };
  }, [authenticated, getAccessToken]);
  if (!authenticated || !credential) return <section id="owner-access"><h2>Owner sign in</h2>
    <p>Use the email that owns this account. Privy sends a one-time login code.</p>
    <button disabled={!ready} onClick={() => login({ loginMethods: ["email"] })}>Log in with email</button>
    {error && <p role="alert">{error}</p>}</section>;
  return <OwnerAccess credential={credential} email={user?.email?.address ?? "verified owner"} requestId={requestId}
    onSession={() => {}} onLogout={() => { setCredential(""); void logout(); }} />;
}
