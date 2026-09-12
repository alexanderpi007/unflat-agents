import { Dashboard } from "@/components/dashboard";
import realRun from "../../public/real-run.json";
import type { RealRun } from "@/demo/export-real-run";
import { ownerModeAvailable } from "@/server/role-auth";

// Evaluate deployment identity at request time, including local production builds.
export const dynamic = "force-dynamic";

export default function Home() {
  return <Dashboard realRun={realRun as RealRun} ownerModeAvailable={ownerModeAvailable()} privyAppId={process.env.VERCEL ? undefined : process.env.PRIVY_APP_ID?.trim()} />;
}
