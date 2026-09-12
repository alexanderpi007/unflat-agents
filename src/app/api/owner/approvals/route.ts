import { z } from "zod";
import { runtime } from "@/server/runtime";
import { requireRole } from "@/server/role-auth";
import { decideRequest } from "@/mcp/service";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { requireRole(request, "owner"); } catch { return Response.json({ error: "Forbidden", detail: "Owner token required; unavailable on Vercel." }, { status: 403 }); }
  try {
  const agents = await runtime.deps.store.listAgents();
  const pending = (await runtime.deps.store.listApprovals()).filter(r => r.status === "pending").slice(-20).map(({ principal: _, ...request }) => ({
    ...request, name: agents.find(agent => agent.id === request.agentId)?.ensName ?? request.agentId,
  }));
  const vault = runtime.deps.vaultAllowlist.find(v => v.execution === "direct-morpho");
  return Response.json({ pending, moneyMode: runtime.health.adapters.privy.mode,
    recipient: runtime.deps.demoPaymentRecipient, vault: vault?.address }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Approvals unavailable", detail: "The local store could not be read." }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { requireRole(request, "owner"); } catch { return Response.json({ error: "Forbidden", detail: "Owner token required." }, { status: 403 }); }
  try {
    const body = z.object({ id: z.string().uuid(), action: z.enum(["approve", "deny"]), confirmation: z.string().optional() }).strict().parse(await request.json());
    return Response.json(await decideRequest(runtime, body.id, body.action === "approve", body.confirmation));
  } catch { return Response.json({ error: "Approval not completed", detail: "Check pending status and type CONFIRM to approve. Inspect the mandate before retrying." }, { status: 400 }); }
}
