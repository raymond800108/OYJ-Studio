import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export interface DropboxConnection {
  access_token: string;
  refresh_token: string;
  account_id: string;
  uid: string;
  token_expires_at: number; // unix ms — short-lived tokens last 4 hours
  connected_at: number;
}

const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const errUrl = (key: string) =>
    new URL(`/social/compose?dropbox_error=${key}`, origin);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error || !code || !state) {
      return NextResponse.redirect(errUrl(error === "access_denied" ? "denied" : "generic"));
    }

    const redis = getRedis();
    if (!redis) return NextResponse.redirect(errUrl("generic"));

    const userId = await redis.get<string>(`ce:dropbox:state:${state}`);
    if (!userId) return NextResponse.redirect(errUrl("invalid_state"));
    await redis.del(`ce:dropbox:state:${state}`);

    const appKey = process.env.DROPBOX_APP_KEY;
    const appSecret = process.env.DROPBOX_APP_SECRET;
    const redirectUri =
      process.env.DROPBOX_REDIRECT_URI || `${origin}/api/auth/dropbox/callback`;

    if (!appKey || !appSecret) return NextResponse.redirect(errUrl("generic"));

    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: appKey,
        client_secret: appSecret,
        redirect_uri: redirectUri,
      }),
    });

    const data = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      account_id?: string;
      uid?: string;
      token_type?: string;
      error?: string;
      error_description?: string;
    };

    if (!data.access_token || !data.refresh_token) {
      console.error("[dropbox-callback] Token exchange failed:", data);
      return NextResponse.redirect(errUrl("token_failed"));
    }

    const connection: DropboxConnection = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      account_id: data.account_id ?? "",
      uid: data.uid ?? "",
      token_expires_at: Date.now() + (data.expires_in ?? 14400) * 1000,
      connected_at: Date.now(),
    };
    await redis.set(`dropbox:${userId}`, JSON.stringify(connection));

    return NextResponse.redirect(new URL("/social/compose?dropbox_connected=1", origin));
  } catch (err) {
    console.error("[dropbox-callback] Error:", err);
    return NextResponse.redirect(errUrl("generic"));
  }
}
