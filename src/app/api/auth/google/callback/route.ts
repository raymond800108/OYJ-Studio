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
    console.error("[google-callback] Error:", error || "missing code/state");
    return NextResponse.redirect(new URL("/?auth_error=google_denied", req.url));
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

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  // Must match the redirect_uri used in the initial auth request
  const origin = new URL(req.url).origin;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${origin}/api/auth/google/callback`;

  try {
    // Exchange code for tokens
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

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      console.error("[google-callback] Token error:", tokenData);
      return NextResponse.redirect(new URL("/?auth_error=token_failed", req.url));
    }

    // Get user info
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userRes.json();

    // Check email allowlist
    if (!isEmailAllowed(userInfo.email)) {
      console.warn("[google-callback] Rejected:", userInfo.email);
      return NextResponse.redirect(new URL("/?auth_error=not_allowed", req.url));
    }

    // Create or update user
    const userId = await createOrUpdateUser({
      providerUserId: userInfo.id,
      name: userInfo.name || "Google User",
      email: userInfo.email || null,
      avatar: userInfo.picture || null,
      provider: "google",
    });

    // Create session
    await createSession(userId);

    return NextResponse.redirect(new URL("/", req.url));
  } catch (err) {
    console.error("[google-callback] Error:", err);
    return NextResponse.redirect(new URL("/?auth_error=google_failed", req.url));
  }
}
