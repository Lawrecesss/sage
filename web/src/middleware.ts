import { NextResponse, type NextRequest } from "next/server";
import { chatPath, newSessionId } from "@/lib/session-id";

/**
 * `/` starts a new conversation. Redirecting here, before rendering, gives a real 307 —
 * doing it in the page would stream the root loading state first and redirect client-side.
 * `?q=` is carried over so "Ask Sage about this" links (`/?q=...`) keep working.
 */
export function middleware(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.slice(0, 4000) || undefined;
  return NextResponse.redirect(new URL(chatPath(newSessionId(), q), req.url));
}

export const config = { matcher: "/" };
