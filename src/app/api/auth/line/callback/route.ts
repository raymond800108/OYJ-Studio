import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { createOrUpdateUser, createSession } from "@/lib/auth";
import { isEmailAllowed } from "@/lib/allowlist";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || !state) {
    console.error("[line-callback] Error:", error || "missing code/state");
    return NextResponse.redirect(new URL("/?auth_error=line_denied", req.url));
  }

  // Verify state
  const redis = getRedis();
  if (redis) {
    const stored = await redis.get(`ce:oauth:state:${state}`);
    if (!stored) {
      return NextResponse.redirect(new URL("/?auth_error=invalid_state", req.url));
    }
    await redis.del(`ce:oauth:state:${state}`);
  }

  const clientId = process.env.LINE_CHANNEL_ID!;
  const clientSecret = process.env.LINE_CHANNEL_SECRET!;
  const redirectUri = process.env.LINE_REDIRECT_URI!;

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
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

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      console.error("[line-callback] Token error:", tokenData);
      return NextResponse.redirect(new URL("/?auth_error=token_failed", req.url));
    }

    const accessToken = tokenData.access_token;

    // Get user profile
    const profileRes = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileRes.json();

    // Try to extract email from id_token (LINE OpenID Connect)
    let email: string | null = null;
    if (tokenData.id_token) {
      try {
        // Decode JWT payload (we trust it since it came directly from LINE)
        const parts = tokenData.id_token.split(".");
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString()
        );
        email = payload.email || null;
      } catch {
        // Email not available
      }
    }

    // Check email allowlist
    if (!isEmailAllowed(email)) {
      console.warn("[line-callback] Rejected:", email);
      return NextResponse.redirect(new URL("/?auth_error=not_allowed", req.url));
    }

    // Create or update user in Redis
    const userId = await createOrUpdateUser({
      providerUserId: profile.userId,
      name: profile.displayName || "LINE User",
      email,
      avatar: profile.pictureUrl || null,
      provider: "line",
    });

    // Create session
    await createSession(userId);

    return NextResponse.redirect(new URL("/", req.url));
  } catch (err) {
    console.error("[line-callback] Error:", err);
    return NextResponse.redirect(new URL("/?auth_error=line_failed", req.url));
  }
}
