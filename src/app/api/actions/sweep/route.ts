import { NextResponse } from "next/server";
import { z } from "zod";
import { runtime } from "@/server/runtime";
import { apiFailure, invalidRequest } from "@/app/api/responses";

const schema = z.object({
  agentId: z.string().uuid(),
  amountUsdcCents: z.number().int().positive(),
  idempotencyKey: z.string().min(8),
  strategyId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    try { requireOwnerMutation(request); } catch (error) { return apiFailure(error, "Owner authorization required.", 403); }
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return invalidRequest(parsed.error.flatten());
    return NextResponse.json(await runtime.gateway.sweepIdle(parsed.data));
  } catch (error) {
    return apiFailure(error, "Sweep failed.");
  }
}
import { requireOwnerMutation } from "@/server/role-auth";
