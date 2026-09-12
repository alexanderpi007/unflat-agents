"use client";
import dynamic from "next/dynamic";
const Login = dynamic(() => import("./owner-login"), { ssr: false, loading: () => <p>Loading Privy email login…</p> });
export function OwnerLoginLoader({ appId, requestId }: { appId?: string; requestId?: string }) {
  if (!appId) return <section id="owner-access"><h2>Owner sign in unavailable</h2><p>The operator must configure Privy email login.</p></section>;
  return <Login appId={appId} requestId={requestId} />;
}
