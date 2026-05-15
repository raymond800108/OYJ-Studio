import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";

interface IgConnection {
  instagram_user_id: string;
  instagram_username: string;
  access_token: string;
  token_expires_at: number;
  connected_at: number;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const origin = url.origin;

  if (error || !code || !state) {
    const errKey = error === "access_denied" ? "denied" : "generic";
    return NextResponse.redirect(new URL(`/?mode=social&ig_error=${errKey}`, origin));
  }

  const redis = getRedis();

  // Validate CSRF state
  let userId: string | null = null;
  if (redis) {
    const stored = await redis.get(`ce:ig:state:${state}`) as string | null;
    if (!stored) {
      return NextResponse.redirect(new URL("/?mode=social&ig_error=generic", origin));
    }
    userId = stored;
    await redis.del(`ce:ig:state:${state}`);
  } else {
    return NextResponse.redirect(new URL("/?mode=social&ig_error=generic", origin));
  }

  const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI || `${origin}/api/auth/instagram/callback`;

  if (!appId || !appSecret) {
    return NextResponse.redirect(new URL("/?mode=social&ig_error=generic", origin));
  }

  try {
    // Step 1: Exchange code for short-lived token
    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error_type || tokenData.error) {
      console.error("[ig-callback] Short token error:", tokenData);
      return NextResponse.redirect(new URL("/?mode=social&ig_error=generic", origin));
    }

    const shortToken: string = tokenData.access_token;

    // Step 2: Exchange for long-lived token (60 days)
    const longTokenRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortToken}`
    );
    const longTokenData = await longTokenRes.json();

    const longToken: string = longTokenData.access_token || shortToken;
    const expiresIn: number = longTokenData.expires_in || 5183944; // ~60 days

    let igUserId = tokenData.user_id as string | undefined;
    let igUsername = "";

    // Step 3: Try to get Instagram Business account via Facebook Pages
    try {
      const fbPagesRes = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?access_token=${longToken}`
      );
      const fbPagesData = await fbPagesRes.json();

      if (fbPagesData.data && Array.isArray(fbPagesData.data)) {
        for (const page of fbPagesData.data) {
          const pageToken: string = page.access_token;
          const pageId: string = page.id;
          try {
            const igAccountRes = await fetch(
              `https://graph.facebook.com/v19.0/${pageId}?fields=instagram_business_account{id,username}&access_token=${pageToken}`
            );
            const igAccountData = await igAccountRes.json();
            if (igAccountData.instagram_business_account) {
              igUserId = igAccountData.instagram_business_account.id;
              igUsername = igAccountData.instagram_business_account.username || "";
              break;
            }
          } catch {
            // continue to next page
          }
        }
      }
    } catch {
      // Fall through to basic IG user fetch
    }

    // Step 4: Fallback — get basic IG user info
    if (!igUsername) {
      const meRes = await fetch(
        `https://graph.instagram.com/me?fields=id,username&access_token=${longToken}`
      );
      const meData = await meRes.json();

      if (meData.error) {
        if (!igUserId) {
          return NextResponse.redirect(new URL("/?mode=social&ig_error=noAccount", origin));
        }
      } else {
        igUserId = igUserId || meData.id;
        igUsername = meData.username || "";
      }
    }

    if (!igUserId) {
      return NextResponse.redirect(new URL("/?mode=social&ig_error=noAccount", origin));
    }

    // Step 5: Store in Redis
    const connection: IgConnection = {
      instagram_user_id: igUserId,
      instagram_username: igUsername,
      access_token: longToken,
      token_expires_at: Date.now() + expiresIn * 1000,
      connected_at: Date.now(),
    };
    await redis.set(`ig:${userId}`, JSON.stringify(connection));

    return NextResponse.redirect(new URL("/?mode=social&connected=true", origin));
  } catch (err) {
    console.error("[ig-callback] Error:", err);
    return NextResponse.redirect(new URL("/?mode=social&ig_error=generic", origin));
  }
}
