"use client";

import dynamic from "next/dynamic";

const OwnerWallet = dynamic(() => import("./privy-owner-wallet"), { ssr: false,
  loading: () => <p>Loading Privy owner authentication…</p> });
export function OwnerWalletLoader({ appId }: { appId: string }) { return <OwnerWallet appId={appId} />; }
