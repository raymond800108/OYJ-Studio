import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

/**
 * Start the Dropbox OAuth flow. Asks for short-lived access_token +
 * long-lived refresh_token (token_access_type=offline) so we can keep
 * reading the user's shared folders without re-prompting.
 *
 * Scopes:
 *   sharing.read        — resolve shared folder links
 *   files.metadata.read — list contents of a shared folder
 *   files.content.read  — download / thumbnail / temporary download links
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const appKey = process.env.DROPBOX_APP_KEY;
  if (!appKey) {
    return NextResponse.json({ error: "Dropbox app not configured" }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const redirectUri =
    process.env.DROPBOX_REDIRECT_URI || `${origin}/api/auth/dropbox/callback`;

  const state = crypto.randomUUID();
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });
  await redis.set(`ce:dropbox:state:${state}`, session.userId, { ex: 600 });

  const params = new URLSearchParams({
    client_id: appKey,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    token_access_type: "offline",
    // Permissions actually requested in App Console must include these,
    // but we don't pass them again here — Dropbox uses the app's config.
  });

  const url = `https://www.dropbox.com/oauth2/authorize?${params}`;
  return NextResponse.redirect(url);
}
