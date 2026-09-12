import { NextResponse } from "next/server";
import { z } from "zod";
import { runtime } from "@/server/runtime";
import { apiFailure, invalidRequest } from "@/app/api/responses";
import { enroll } from "@/mcp/enrollment";

const inputSchema = z.object({ displayName: z.string().min(1).max(36), owner_email: z.string().trim().toLowerCase().email().max(254) }).strict();

export async function POST(request: Request) {
  try {
    try { requireOwnerMutation(request); } catch (error) { return apiFailure(error, "Owner authorization required.", 403); }
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return invalidRequest(parsed.error.flatten());
    return NextResponse.json(await enroll(runtime, parsed.data.displayName, parsed.data.owner_email), { status: 201 });
  } catch (error) {
    return apiFailure(error, "Agent creation failed.");
  }
}
import { requireOwnerMutation } from "@/server/role-auth";
