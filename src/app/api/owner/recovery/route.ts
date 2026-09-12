import { z } from "zod";
import { isAddress, zeroAddress } from "viem";
import { requireRole } from "@/server/role-auth";
import { runtime } from "@/server/runtime";

const address = z.string().refine(value => isAddress(value) && value.toLowerCase() !== zeroAddress).transform(value => value as `0x${string}`);
const common = { accountId: z.string().uuid(), confirmation: z.literal("CONFIRM"), requestId: z.string().uuid() };
const input = z.discriminatedUnion("action", [
  z.object({ ...common, action: z.literal("earn.recall"), sharesRaw: z.string().regex(/^[1-9][0-9]{0,76}$/), vaultAddress: address }).strict(),
  z.object({ ...common, action: z.literal("owner.transfer"), recipient: address, amountUsdcCents: z.number().int().min(1).max(100) }).strict(),
]);
export async function POST(request: Request) {
  try { requireRole(request, "owner"); } catch {
    return Response.json({ error: "Forbidden", detail: "Owner token required. Agent tokens cannot withdraw or recall. Disabled on Vercel." }, { status: 403 });
  }
  try {
    const body = input.parse(await request.json());
    const result = await runtime.gateway.ownerRecovery({ ...body, agentId: body.accountId,
      idempotencyKey: `owner-recovery:${body.accountId}:${body.requestId}`,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const detail = error instanceof Error && error.message.startsWith("REFUSED") ? error.message
      : "Recovery not completed. Check CONFIRM, the owner-granted budget, wallet balance and vault liquidity. Inspect the statement before retrying.";
    return Response.json({ error: "Recovery refused", detail }, { status: 400 });
  }
}
