import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import type { MetaAdsConnection } from "@/app/api/auth/meta-ads/callback/route";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

  const raw = await redis.get(`meta_ads:${session.userId}`);
  if (!raw) {
    return NextResponse.json({ connected: false, user_name: null, connected_at: null });
  }

  const conn: MetaAdsConnection =
    typeof raw === "string" ? JSON.parse(raw) : (raw as MetaAdsConnection);

  return NextResponse.json({
    connected: true,
    user_name: conn.user_name,
    connected_at: conn.connected_at,
    token_expires_at: conn.token_expires_at,
  });
}
