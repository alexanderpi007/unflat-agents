import { NextResponse } from "next/server";
import { runtime } from "@/server/runtime";
import { apiFailure } from "@/app/api/responses";
import { requireRole } from "@/server/role-auth";

export async function GET(_request: Request, context: { params: Promise<{ agentId: string }> }) {
  try { requireRole(_request, "owner"); } catch { return Response.json({ error: "Forbidden", detail: "Owner token required." }, { status: 403 }); }
  try {
    const { agentId } = await context.params;
    return NextResponse.json(await runtime.gateway.state(agentId));
  } catch (error) {
    return apiFailure(error, "Agent not found.", 404);
  }
}
