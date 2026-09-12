import { NextResponse } from "next/server";
import { runtime } from "@/server/runtime";
import { apiFailure } from "@/app/api/responses";

export async function GET(_request: Request, context: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await context.params;
    return NextResponse.json(await runtime.gateway.state(agentId));
  } catch (error) {
    return apiFailure(error, "Agent not found.", 404);
  }
}
