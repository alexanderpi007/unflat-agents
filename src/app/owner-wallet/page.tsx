import { notFound } from "next/navigation";
import { OwnerWalletLoader } from "@/components/owner-wallet-loader";

export const dynamic = "force-dynamic";
export default function OwnerWalletPage() {
  if (process.env.VERCEL) notFound();
  const appId = process.env.PRIVY_APP_ID?.trim();
  if (!appId) return <main><h1>Owner wallet login unavailable</h1><p>The operator must configure the Privy app ID. No wallet will be created here.</p></main>;
  return <OwnerWalletLoader appId={appId} />;
}
