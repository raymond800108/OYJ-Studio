import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import type { MetaAdsConnection } from "@/app/api/auth/meta-ads/callback/route";

const FB_GRAPH = "https://graph.facebook.com/v19.0";

export interface AdAccount {
  id: string; // "act_XXXXXXXX"
  name: string;
  /** 1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 7=PENDING_RISK_REVIEW, 9=IN_GRACE_PERIOD */
  account_status: number;
  currency: string;
  timezone_name: string;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

  const { userId } = session;

  // Cache 1 hour
  const cached = await redis.get(`meta_ads:accounts:${userId}`);
  if (cached) {
    const accounts = typeof cached === "string" ? JSON.parse(cached) : cached;
    return NextResponse.json(accounts);
  }

  const rawConn = await redis.get(`meta_ads:${userId}`);
  if (!rawConn) return NextResponse.json({ error: "meta_ads_not_connected" }, { status: 401 });

  const conn: MetaAdsConnection =
    typeof rawConn === "string" ? JSON.parse(rawConn) : (rawConn as MetaAdsConnection);

  const res = await fetch(
    `${FB_GRAPH}/me/adaccounts?fields=id,name,account_status,currency,timezone_name&access_token=${conn.access_token}`
  );
  const data = (await res.json()) as {
    data?: AdAccount[];
    error?: { code: number; message: string };
  };

  if (data.error) {
    if (data.error.code === 190) {
      await redis.del(`meta_ads:${userId}`);
      return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 401 });
    }
    return NextResponse.json({ error: data.error.message }, { status: 502 });
  }

  const accounts = data.data ?? [];
  await redis.set(`meta_ads:accounts:${userId}`, JSON.stringify(accounts), { ex: 3600 });

  return NextResponse.json(accounts);
}
