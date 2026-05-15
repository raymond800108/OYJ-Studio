import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth";

/**
 * Next.js 16 Proxy (replaces middleware.ts).
 * Performs optimistic JWT check — no Redis call.
 * Actual session + credit validation happens in route handlers.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get("ce-session")?.value;

  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const valid = await verifySessionToken(token);
  if (!valid) {
    return NextResponse.json(
      { error: "Session expired — please sign in again" },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

/**
 * Only protect API routes that consume credits.
 * Public routes (auth, usage, static assets) are excluded.
 */
export const config = {
  matcher: [
    "/api/generate/:path*",
    "/api/fal/:path*",
    "/api/inpaint/:path*",
    "/api/kie/:path*",
    "/api/meshy/:path*",
    "/api/upload/:path*",
    "/api/estimate/:path*",
    "/api/analyze-jewelry/:path*",
    "/api/analyze-character/:path*",
    "/api/analyze-outfit/:path*",
    "/api/proxy-model/:path*",
  ],
};
