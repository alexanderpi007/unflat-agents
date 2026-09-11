import { NextResponse } from "next/server";
import { z } from "zod";
import { runtime } from "@/server/runtime";

const schema = z.object({ agentId: z.string().uuid(), ownerKey: z.string().min(32) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json(await runtime.gateway.publishEncryptedStatement(parsed.data.agentId, parsed.data.ownerKey));
}

