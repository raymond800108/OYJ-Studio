import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

const FB_GRAPH = "https://graph.facebook.com/v19.0";

interface FBTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message: string; type: string; code: number };
}

interface FBUserResponse {
  id?: string;
  name?: string;
  error?: { message: string };
}

export interface MetaAdsConnection {
  access_token: string;
  token_expires_at: number; // unix ms
  connected_at: number;
  user_id: string;
  user_name: string;
}

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const adsUrl = (param: string) =>
    new URL(`/social/ads?ma_error=${param}`, origin);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) return NextResponse.redirect(adsUrl("denied"));
    if (!code || !state) return NextResponse.redirect(adsUrl("invalid_request"));

    const redis = getRedis();
    if (!redis) return NextResponse.redirect(adsUrl("server_error"));

    const convraUserId = await redis.get<string>(`ce:ma:state:${state}`);
    if (!convraUserId) return NextResponse.redirect(adsUrl("invalid_state"));
    await redis.del(`ce:ma:state:${state}`);

    const appId = process.env.META_APP_ID ?? process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.META_APP_SECRET ?? process.env.INSTAGRAM_APP_SECRET;
    const redirectUri =
      process.env.META_ADS_REDIRECT_URI ?? `${origin}/api/auth/meta-ads/callback`;

    if (!appId || !appSecret) {
      return NextResponse.redirect(adsUrl("server_error"));
    }

    // Step 1: short-lived token
    const shortRes = await fetch(
      `${FB_GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code,
        })
    );
    const shortToken = (await shortRes.json()) as FBTokenResponse;
    if (!shortToken.access_token) {
      console.error("[meta-ads-callback] short token error:", shortToken);
      return NextResponse.redirect(adsUrl("token_failed"));
    }

    // Step 2: long-lived token (60 days) via fb_exchange_token
    const longRes = await fetch(
      `${FB_GRAPH}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortToken.access_token,
        })
    );
    const longToken = (await longRes.json()) as FBTokenResponse;
    if (!longToken.access_token) {
      console.error("[meta-ads-callback] long token error:", longToken);
      return NextResponse.redirect(adsUrl("token_exchange_failed"));
    }

    const tokenExpiresAt = Date.now() + ((longToken.expires_in ?? 5184000) * 1000);

    // Step 3: get Facebook user info
    const userRes = await fetch(
      `${FB_GRAPH}/me?fields=id,name&access_token=${longToken.access_token}`
    );
    const userInfo = (await userRes.json()) as FBUserResponse;

    const connection: MetaAdsConnection = {
      access_token: longToken.access_token,
      token_expires_at: tokenExpiresAt,
      connected_at: Date.now(),
      user_id: userInfo.id ?? "",
      user_name: userInfo.name ?? "Facebook User",
    };

    // Stored under separate key — never touches ig:{userId}
    await redis.set(`meta_ads:${convraUserId}`, JSON.stringify(connection));

    return NextResponse.redirect(new URL("/social/ads?connected=true", origin));
  } catch (err) {
    console.error("[meta-ads-callback] unexpected error:", err);
    return NextResponse.redirect(new URL("/social/ads?ma_error=unknown", origin));
  }
}
