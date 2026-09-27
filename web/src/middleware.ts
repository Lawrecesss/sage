import { NextResponse, type NextRequest } from "next/server";
import { chatPath, newSessionId } from "@/lib/session-id";

/**
 * `/` starts a new conversation. Redirecting here, before rendering, gives a real 307 —
 * doing it in the page would stream the root loading state first and redirect client-side.
 * `?q=` and `?report=` are carried over so "Ask Sage about this" links (`/?q=...`) and the
 * Reports page's "Discuss in chat" (`/?q=...&report=...`) keep working.
 */
export function middleware(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.slice(0, 4000) || undefined;
  const report = req.nextUrl.searchParams.get("report") || undefined;
  return NextResponse.redirect(new URL(chatPath(newSessionId(), q, report), req.url));
}

export const config = { matcher: "/" };
