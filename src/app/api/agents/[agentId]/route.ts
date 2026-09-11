import { NextResponse } from "next/server";
import { runtime } from "@/server/runtime";

export async function GET(_request: Request, context: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await context.params;
    return NextResponse.json(await runtime.gateway.state(agentId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Not found." }, { status: 404 });
  }
}

