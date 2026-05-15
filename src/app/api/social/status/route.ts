import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

interface IgConnection {
  instagram_user_id: string;
  instagram_username: string;
  access_token: string;
  token_expires_at: number;
  connected_at: number;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ connected: false, username: null, connected_at: null });
  }

  const raw = await redis.get(`ig:${session.userId}`);
  if (!raw) {
    return NextResponse.json({ connected: false, username: null, connected_at: null });
  }

  const conn: IgConnection = typeof raw === "string" ? JSON.parse(raw) : (raw as IgConnection);
  return NextResponse.json({
    connected: true,
    username: conn.instagram_username || null,
    connected_at: conn.connected_at || null,
  });
}
