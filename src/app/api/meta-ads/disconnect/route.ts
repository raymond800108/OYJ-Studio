import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

  const { userId } = session;

  // Only deletes meta_ads:* keys — never touches ig:* keys
  await Promise.all([
    redis.del(`meta_ads:${userId}`),
    redis.del(`meta_ads:accounts:${userId}`),
    redis.del(`meta_ads:campaigns:${userId}`),
    redis.del(`meta_ads:insights:${userId}`),
    redis.del(`meta_ads:diagnosis:${userId}`),
  ]);

  return NextResponse.json({ success: true });
}
