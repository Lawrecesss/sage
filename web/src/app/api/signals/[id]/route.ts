// GET /api/signals/[id]
// STUB — structure only, no implementation yet.
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // TODO: implement
  await params;
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
