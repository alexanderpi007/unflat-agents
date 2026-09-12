import { notFound } from "next/navigation";
import { OwnerLoginLoader } from "@/components/owner-login-loader";

export const dynamic = "force-dynamic";
export default async function OwnerPage({ searchParams }: { searchParams: Promise<{ request?: string | string[] }> }) {
  if (process.env.VERCEL) notFound();
  const { request } = await searchParams;
  const id = typeof request === "string" ? request : undefined;
  return <main style={{ maxWidth: 720, margin: "64px auto", padding: 24 }}><h1>Approve your agent's budget</h1>
    <OwnerLoginLoader appId={process.env.PRIVY_APP_ID?.trim()} requestId={id} /></main>;
}
