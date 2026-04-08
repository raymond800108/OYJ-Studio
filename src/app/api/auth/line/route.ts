import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export async function GET() {
  const clientId = process.env.LINE_CHANNEL_ID;
  const redirectUri = process.env.LINE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "LINE OAuth not configured" },
      { status: 500 }
    );
  }

  // Generate state for CSRF protection
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  // Store state in Redis (10 min TTL)
  const redis = getRedis();
  if (redis) {
    await redis.set(`ce:oauth:state:${state}`, nonce, { ex: 600 });
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: "profile openid email",
    nonce,
  });

  const url = `https://access.line.me/oauth2/v2.1/authorize?${params}`;
  return NextResponse.redirect(url);
}
