import { z } from "zod";
import { apiFailure } from "@/app/api/responses";
import { invalidRequest } from "@/app/api/responses";
import { runtime as gatewayRuntime } from "@/server/runtime";
import { ownerModeAvailable, requireRole, sameBrowserOrigin } from "@/server/role-auth";
import { dashboardRuntime, demoAgent, persistentAgentId, persistentWalletAddress, requireDemoAdapters, runDashboardSequence } from "@/demo/dashboard-run";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
let running = false;

export async function GET(request: Request) {
  try {
    let owner = false;
    try { requireRole(request, "owner"); owner = true; } catch { /* Public read-only view. */ }
    const state = owner && await gatewayRuntime.deps.store.getAgent(persistentAgentId)
      ? await gatewayRuntime.gateway.state(persistentAgentId) : null;
    const resolved = await gatewayRuntime.gateway.resolveIdentity("atlas.agents.unflat.eth").catch(() => null);
    const identity = { displayName: "Atlas", ensName: "atlas.agents.unflat.eth", walletAddress: persistentWalletAddress,
      ensResolvedAddress: resolved?.address ?? null, ensMode: resolved?.mode, ensExplorerUrl: resolved?.explorerUrl,
      ensRegistrationTransaction: resolved?.mode === "live" ? "0xb3026ea2ad2d53cd463fbe47a3cfcda39c218d7f53b78a6836fc9a54adfaf5bf" : undefined };
    const vault = gatewayRuntime.deps.vaultAllowlist.find(v => v.execution === "direct-morpho");
    return Response.json({ state, identity, ownerModeAvailable: ownerModeAvailable(), localLiveAvailable: owner, walletAddress: persistentWalletAddress,
      plan: owner ? { recipient: gatewayRuntime.deps.demoPaymentRecipient, vault: vault?.address,
        transferUsdc: "0.05", depositUsdc: "1.00", totalUsdc: "1.05", network: "Base mainnet", fee: "plus gas" } : undefined },
    { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error, "Live demo state could not be read.");
  }
}

const schema = z.object({ mode: z.enum(["mock", "live"]), confirmation: z.string().optional(), runId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return invalidRequest(parsed.error.flatten());
    const { mode, confirmation, runId } = parsed.data;
    if (mode === "live") {
      try { requireRole(request, "owner"); } catch (error) { return apiFailure(error, "LIVE execution forbidden.", 403); }
      if (confirmation !== "CONFIRM") return invalidRequest("Type CONFIRM to authorize exactly 1.05 USDC plus Base gas.");
    } else if (!sameBrowserOrigin(request)) {
      return apiFailure(new Error("Same-origin browser request required."), "Demo request forbidden.", 403);
    }
    if (running) return apiFailure(new Error("A demo is already running in this process."), "Demo busy.", 409);
    const configured = dashboardRuntime(mode);
    requireDemoAdapters(configured, mode);
    running = true;
    let agent;
    let previousEventCount = 0;
    try {
      agent = await demoAgent(configured, mode);
      previousEventCount = (await configured.deps.store.listEvents(agent.id)).length;
      if (mode === "live") {
        const claim = await configured.deps.store.claimIdempotency(`dashboard:${runId}`, "Base:transfer5:deposit100");
        if (!claim.fresh) throw new Error("This LIVE run was already submitted. Inspect the statement; do not submit again.");
      }
    } catch (error) { running = false; throw error; }
    const encoder = new TextEncoder();
    let connected = true;
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (value: unknown) => { if (connected) controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`)); };
        try {
          await runDashboardSequence(configured, agent, mode, runId, emit);
          if (mode === "live") await configured.deps.store.finishIdempotency(`dashboard:${runId}`, { complete: true });
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Unknown failure";
          if (mode === "live") await configured.deps.store.failIdempotency(`dashboard:${runId}`, detail);
          const state = await configured.gateway.state(agent.id);
          emit({ moneyMode: mode, phase: "Failed — inspect statement before retry", error: "Demo failed.", detail,
            snapshot: state.mandate ? { ...state, events: state.events.slice(previousEventCount) } : undefined });
        } finally { running = false; if (connected) controller.close(); }
      },
      cancel() { connected = false; },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
  } catch (error) {
    return apiFailure(error, "Demo failed.");
  }
}
