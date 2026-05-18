import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

export interface GoogleSheetsConnection {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_expires_at: number; // unix ms
  connected_at: number;
}

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const errUrl = (key: string) =>
    new URL(`/social?sheets_error=${key}`, origin);

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

    const userId = await redis.get<string>(`ce:sheets:state:${state}`);
    if (!userId) return NextResponse.redirect(errUrl("invalid_state"));
    await redis.del(`ce:sheets:state:${state}`);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_SHEETS_REDIRECT_URI ||
      `${origin}/api/auth/google-sheets/callback`;

    if (!clientId || !clientSecret) return NextResponse.redirect(errUrl("generic"));

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenData.access_token || !tokenData.refresh_token) {
      console.error("[sheets-callback] Token exchange failed:", tokenData);
      return NextResponse.redirect(errUrl("token_failed"));
    }

    const connection: GoogleSheetsConnection = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scope: tokenData.scope || "",
      token_expires_at: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      connected_at: Date.now(),
    };
    await redis.set(`google:sheets:${userId}`, JSON.stringify(connection));

    return NextResponse.redirect(new URL("/social?sheets_connected=1", origin));
  } catch (err) {
    console.error("[sheets-callback] Error:", err);
    return NextResponse.redirect(errUrl("generic"));
  }
}
