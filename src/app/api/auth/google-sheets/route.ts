import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

/**
 * Starts a separate Google OAuth flow JUST for Sheets read access.
 * Kept independent from the login flow so users aren't prompted for
 * Sheets consent unless they explicitly want to import a sheet.
 *
 * Stores refresh_token (access_type=offline + prompt=consent) so we
 * can refresh the 1-hour access token without re-prompting.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  // Distinct callback so we don't clash with the login flow
  const redirectUri =
    process.env.GOOGLE_SHEETS_REDIRECT_URI ||
    `${origin}/api/auth/google-sheets/callback`;

  const state = crypto.randomUUID();
  const redis = getRedis();
  if (redis) {
    await redis.set(`ce:sheets:state:${state}`, session.userId, { ex: 600 });
  } else {
    return NextResponse.json({ error: "Redis not configured" }, { status: 500 });
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    access_type: "offline",
    prompt: "consent", // force refresh_token even on re-auth
    include_granted_scopes: "true",
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  return NextResponse.redirect(url);
}
