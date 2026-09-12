import { NextResponse } from "next/server";
import { z } from "zod";
import { runtime } from "@/server/runtime";
import { apiFailure, invalidRequest } from "@/app/api/responses";

const inputSchema = z.object({ displayName: z.string().min(1).max(64) });

export async function POST(request: Request) {
  try {
    try { requireLocalMutation(request); } catch (error) { return apiFailure(error, "Local execution only.", 403); }
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return invalidRequest(parsed.error.flatten());
    return NextResponse.json(await runtime.gateway.createAgent(parsed.data.displayName), { status: 201 });
  } catch (error) {
    return apiFailure(error, "Agent creation failed.");
  }
}
import { requireLocalMutation } from "@/server/local-only";
