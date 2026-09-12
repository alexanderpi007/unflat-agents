import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({
    error: "Owner browser required.",
    detail: "Use Publish statement in the OWNER RECORD card. Swarm ID handles encryption and storage in the browser; never send a reference or encryption key to this API.",
  }, { status: 409, headers: { "Cache-Control": "no-store" } });
}
