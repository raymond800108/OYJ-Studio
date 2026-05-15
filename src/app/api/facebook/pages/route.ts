import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import type { MetaAdsConnection } from "@/app/api/auth/meta-ads/callback/route";

const FB_GRAPH = "https://graph.facebook.com/v19.0";

export interface FacebookPage {
  id: string;
  name: string;
  /** Page access token — preferred for publishing (longer-lived than user token) */
  access_token: string;
}

/**
 * GET /api/facebook/pages
 * Lists Facebook Pages the connected Meta user manages.
 * Cached 1 hour under `meta_ads:pages:{userId}`.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

  const { userId } = session;

  const cached = await redis.get(`meta_ads:pages:${userId}`);
  if (cached) {
    const pages = typeof cached === "string" ? JSON.parse(cached) : cached;
    return NextResponse.json({ data: pages });
  }

  const rawConn = await redis.get(`meta_ads:${userId}`);
  if (!rawConn) return NextResponse.json({ error: "meta_ads_not_connected" }, { status: 401 });
  const conn: MetaAdsConnection =
    typeof rawConn === "string" ? JSON.parse(rawConn) : (rawConn as MetaAdsConnection);

  const res = await fetch(
    `${FB_GRAPH}/me/accounts?fields=id,name,access_token&access_token=${conn.access_token}`
  );
  const data = (await res.json()) as {
    data?: FacebookPage[];
    error?: { code: number; message: string };
  };

  if (data.error) {
    if (data.error.code === 190) {
      await redis.del(`meta_ads:${userId}`);
      return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 401 });
    }
    return NextResponse.json({ error: data.error.message }, { status: 502 });
  }

  const pages = data.data ?? [];
  await redis.set(`meta_ads:pages:${userId}`, JSON.stringify(pages), { ex: 3600 });
  return NextResponse.json({ data: pages });
}
