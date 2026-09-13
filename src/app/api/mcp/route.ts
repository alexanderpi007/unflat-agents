import { runtime as configured } from "@/server/runtime";
import { handleMcp } from "@/mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => handleMcp(request, configured);
export const GET = (request: Request) => handleMcp(request, configured);
export const DELETE = (request: Request) => handleMcp(request, configured);
