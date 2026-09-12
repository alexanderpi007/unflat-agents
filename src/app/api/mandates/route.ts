import { NextResponse } from "next/server";
import { z } from "zod";
import { runtime } from "@/server/runtime";
import { apiFailure, invalidRequest } from "@/app/api/responses";

const inputSchema = z.object({
  agentId: z.string().uuid(),
  ownerId: z.string().min(1),
  durationSeconds: z.number().int().positive(),
  maxPerActionUsdcCents: z.number().int().positive(),
  maxTotalUsdcCents: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    try { requireOwnerMutation(request); } catch (error) { return apiFailure(error, "Owner authorization required.", 403); }
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return invalidRequest(parsed.error.flatten());
    return NextResponse.json(await runtime.gateway.grantMandate(parsed.data), { status: 201 });
  } catch (error) {
    return apiFailure(error, "Mandate creation failed.");
  }
}
import { requireOwnerMutation } from "@/server/role-auth";
