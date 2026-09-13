import { Dashboard } from "@/components/dashboard";
import nova from "../../public/real-runs/nova-2026-09-13.json";
import atlas from "../../public/real-runs/atlas-2026-09-12.json";
import type { RealRun } from "@/demo/export-real-run";
import { ownerModeAvailable } from "@/server/role-auth";

// Evaluate deployment identity at request time, including local production builds.
export const dynamic = "force-dynamic";

export default function Home() {
  return <Dashboard realRuns={[nova, atlas] as RealRun[]} ownerModeAvailable={ownerModeAvailable()} privyAppId={process.env.VERCEL ? undefined : process.env.PRIVY_APP_ID?.trim()} />;
}
