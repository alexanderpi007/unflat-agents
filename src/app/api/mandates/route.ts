import { NextResponse } from "next/server";
import { z } from "zod";
import { runtime } from "@/server/runtime";

const inputSchema = z.object({
  agentId: z.string().uuid(),
  ownerId: z.string().min(1),
  durationSeconds: z.number().int().positive(),
  maxPerActionUsdcCents: z.number().int().positive(),
  maxTotalUsdcCents: z.number().int().positive(),
});

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(await runtime.gateway.grantMandate(parsed.data), { status: 201 });
}

