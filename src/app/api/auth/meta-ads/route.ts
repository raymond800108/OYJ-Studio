import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { getSession } from "@/lib/auth";

/**
 * Initiates Meta Ads OAuth via facebook.com/dialog/oauth.
 * Uses `ce:ma:state:` Redis prefix (separate from Instagram's `ce:ig:state:`
 * to prevent cross-contamination if both flows are mid-OAuth).
 */
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(
      new URL("/social/ads?ma_error=login_required", origin)
    );
  }

  const appId = process.env.META_APP_ID ?? process.env.INSTAGRAM_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "Meta App ID not configured" }, { status: 500 });
  }

  const redirectUri =
    process.env.META_ADS_REDIRECT_URI ?? `${origin}/api/auth/meta-ads/callback`;

  const state = crypto.randomUUID();

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Redis not configured" }, { status: 500 });
  }

  await redis.set(`ce:ma:state:${state}`, session.userId, { ex: 600 });

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "ads_read,ads_management,public_profile",
    state,
    response_type: "code",
  });

  const oauthUrl = `https://www.facebook.com/dialog/oauth?${params}`;

  // Debug mode — visit /api/auth/meta-ads?debug=1 to see the resolved URL.
  if (req.nextUrl.searchParams.get("debug") === "1") {
    return NextResponse.json({ oauthUrl, redirectUri, appId });
  }

  return NextResponse.redirect(oauthUrl);
}
