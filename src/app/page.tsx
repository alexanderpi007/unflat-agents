import { Dashboard } from "@/components/dashboard";
import realRun from "../../public/real-run.json";
import type { RealRun } from "@/demo/export-real-run";

export default function Home() {
  return <Dashboard realRun={realRun as RealRun} />;
}
