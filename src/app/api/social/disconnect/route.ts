import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const redis = getRedis();
  if (redis) {
    await Promise.all([
      redis.del(`ig:${session.userId}`),
      redis.del(`ig:posts:${session.userId}`),
      redis.del(`ig:diagnosis:${session.userId}`),
    ]);
  }

  return NextResponse.json({ success: true });
}
