// GET /api/brief/latest — always returns the last row in `briefings`; a failed
// run never removes the previous good brief (graceful-degradation story).
// STUB — structure only, no implementation yet.
import { NextResponse } from "next/server";

export async function GET() {
  // TODO: implement
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
