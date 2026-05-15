import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "Instagram app not configured." }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const redirectUri = process.env.META_REDIRECT_URI || `${origin}/api/auth/instagram/callback`;

  // Generate CSRF state
  const state = crypto.randomUUID();
  const redis = getRedis();
  if (redis) {
    await redis.set(`ce:ig:state:${state}`, session.userId, { ex: 600 });
  }

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "instagram_business_basic,instagram_business_manage_insights",
    state,
    response_type: "code",
  });

  const url = `https://www.instagram.com/oauth/authorize?${params}`;
  return NextResponse.redirect(url);
}
