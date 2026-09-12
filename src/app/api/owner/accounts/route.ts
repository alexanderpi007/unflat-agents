import { z } from "zod";
import { runtime } from "@/server/runtime";
import { requireRole } from "@/server/role-auth";
import { grantOwnerAccount, listOwnerAccounts } from "@/server/owner-accounts";

export const dynamic = "force-dynamic";
const forbidden = () => Response.json({ error: "Forbidden", detail: "Owner token required; disabled on Vercel." }, { status: 403 });
export async function GET(request: Request) {
  try { requireRole(request, "owner"); } catch { return forbidden(); }
  try { return Response.json(await listOwnerAccounts(runtime), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Accounts unavailable", detail: "Could not read the gateway accounts. No balance is assumed to be zero." }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { requireRole(request, "owner"); } catch { return forbidden(); }
  try {
    const input = z.object({ accountId: z.string().uuid(), requestId: z.string().uuid(), confirmation: z.literal("CONFIRM") }).strict().parse(await request.json());
    return Response.json(await grantOwnerAccount(runtime, input.accountId, input.requestId, input.confirmation));
  } catch { return Response.json({ error: "Grant not completed", detail: "Check this account and request status. CONFIRM is required. Inspect the mandate before retrying." }, { status: 400 }); }
}
