import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ connected: false });
  const redis = getRedis();
  if (!redis) return NextResponse.json({ connected: false });
  const raw = await redis.get(`google:sheets:${session.userId}`);
  return NextResponse.json({ connected: Boolean(raw) });
}
