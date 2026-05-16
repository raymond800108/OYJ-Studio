import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

const FB_GRAPH = "https://graph.facebook.com/v19.0";
const IG_GRAPH = "https://graph.instagram.com";

interface IgConnection {
  instagram_user_id: string;
  instagram_username: string;
  access_token: string;
  token_expires_at: number;
  connected_at: number;
}

/**
 * DIAGNOSTIC route — inspects the stored Instagram token's scopes
 * via Graph debug_token + verifies the IG account it's tied to.
 * Helpful when /media_publish returns "missing permissions" — this
 * shows whether the token actually has instagram_business_content_publish.
 *
 * No state changes. Returns a sanitised report (token itself never
 * leaks; only first/last 6 chars + length).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

  const raw = await redis.get(`ig:${session.userId}`);
  if (!raw) {
    return NextResponse.json({ connected: false, error: "No ig:{userId} in Redis" });
  }

  const conn: IgConnection =
    typeof raw === "string" ? JSON.parse(raw) : (raw as IgConnection);
  const token = conn.access_token;
  const tokenPreview = `${token.slice(0, 6)}…${token.slice(-6)} (length ${token.length})`;

  const report: Record<string, unknown> = {
    connected: true,
    storedConnection: {
      instagram_user_id: conn.instagram_user_id,
      instagram_username: conn.instagram_username,
      tokenPreview,
      token_expires_at: new Date(conn.token_expires_at).toISOString(),
      connected_at: new Date(conn.connected_at).toISOString(),
    },
  };

  // 1) Hit /me on graph.instagram.com — confirms IG account + account_type
  try {
    const meRes = await fetch(
      `${IG_GRAPH}/me?fields=id,username,account_type&access_token=${token}`
    );
    report.igGraphMe = await meRes.json();
  } catch (e) {
    report.igGraphMe = { error: e instanceof Error ? e.message : String(e) };
  }

  // 2) Hit /me/permissions on graph.instagram.com — list granted scopes
  try {
    const permsRes = await fetch(
      `${IG_GRAPH}/me/permissions?access_token=${token}`
    );
    report.igGraphPermissions = await permsRes.json();
  } catch (e) {
    report.igGraphPermissions = { error: e instanceof Error ? e.message : String(e) };
  }

  // 3) Try debug_token via Facebook Graph (works for FB-style tokens, useful
  //    when IG OAuth returned a Facebook page token)
  const appId = process.env.INSTAGRAM_APP_ID ?? process.env.META_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET;
  if (appId && appSecret) {
    try {
      const appAccessToken = `${appId}|${appSecret}`;
      const debugRes = await fetch(
        `${FB_GRAPH}/debug_token?input_token=${token}&access_token=${appAccessToken}`
      );
      report.fbDebugToken = await debugRes.json();
    } catch (e) {
      report.fbDebugToken = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // 4) Try /me/accounts (Facebook Pages) — tells us if the token is FB
  //    page-style and which IG Business account is wired up
  try {
    const pagesRes = await fetch(
      `${FB_GRAPH}/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${token}`
    );
    report.fbPages = await pagesRes.json();
  } catch (e) {
    report.fbPages = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json(report);
}
