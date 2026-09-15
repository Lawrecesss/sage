// GET /api/health
// STUB — structure only, no implementation yet.
import { NextResponse } from "next/server";

export async function GET() {
  // TODO: implement
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
