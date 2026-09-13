import { z } from "zod";
import { runtime } from "@/server/runtime";
import { authenticateOwner, ownsAccount, requireOwnedAccount, type OwnerPrincipal } from "@/server/owner-auth";
import { decideRequest } from "@/mcp/service";
import { accountChain } from "@/core/chains";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  let owner: OwnerPrincipal;
  try { owner = await authenticateOwner(request); } catch { return Response.json({ error: "Forbidden", detail: "Privy owner login required; unavailable on Vercel." }, { status: 403 }); }
  try {
  const selected = new URL(request.url).searchParams.get("request");
  if (selected && !z.string().uuid().safeParse(selected).success) return Response.json({ error: "Invalid request", detail: "The approval link must contain a request UUID." }, { status: 400 });
  const agents = await runtime.deps.store.listAgents();
  const accounts = await runtime.deps.store.listAccounts();
  const requests = (await runtime.deps.store.listApprovals()).filter(r => (!selected || r.id === selected)
    && ownsAccount(owner, accounts.find(a => a.id === r.agentId), agents.find(a => a.id === r.agentId)));
  const pending = requests.filter(r => r.status === "pending").slice(-20).map(({ principal: _, ...request }) => ({
    ...request, name: agents.find(agent => agent.id === request.agentId)?.ensName ?? request.agentId,
    chain: accountChain(agents.find(agent => agent.id === request.agentId)?.chain ?? accounts.find(account => account.id === request.agentId)?.chain),
  }));
  const vault = runtime.deps.vaultAllowlist.find(v => v.execution === "direct-morpho");
  return Response.json({ pending, ...(selected ? { request: requests[0] ? { id: requests[0].id, status: requests[0].status } : null } : {}), moneyMode: runtime.health.adapters.privy.mode,
    recipient: runtime.deps.demoPaymentRecipient, vault: vault?.address }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Approvals unavailable", detail: "The local store could not be read." }, { status: 500 }); }
}
export async function POST(request: Request) {
  let owner: OwnerPrincipal;
  try { owner = await authenticateOwner(request); } catch { return Response.json({ error: "Forbidden", detail: "Privy owner login required." }, { status: 403 }); }
  try {
    const body = z.object({ id: z.string().uuid(), action: z.enum(["approve", "deny"]), confirmation: z.string().optional() }).strict().parse(await request.json());
    const target = (await runtime.deps.store.listApprovals()).find(r => r.id === body.id);
    try { if (!target) throw new Error("Missing request"); await requireOwnedAccount(owner, runtime.deps.store, target.agentId); }
    catch { return Response.json({ error: "Forbidden", detail: "Request not found for your verified Privy email." }, { status: 403 }); }
    return Response.json(await decideRequest(runtime, body.id, body.action === "approve", body.confirmation));
  } catch { return Response.json({ error: "Approval not completed", detail: "Check pending status and type CONFIRM to approve. Inspect the mandate before retrying." }, { status: 400 }); }
}
