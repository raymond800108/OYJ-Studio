import { NextRequest, NextResponse } from "next/server";
import { Client as QStashClient } from "@upstash/qstash";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

export interface ScheduledPost {
  postId: string;
  userId: string;
  mediaUrl: string;
  caption: string;
  presetId: string | null;
  platform: "instagram" | "facebook";
  scheduledUtcMs: number;
  status: "pending" | "published" | "failed";
  publishedAt?: number;
  metaPostId?: string;
  error?: string;
  createdAt: number;
}

function queueKey(userId: string, postId: string) {
  return `ig:queue:${userId}:${postId}`;
}

/**
 * POST /api/instagram/schedule
 * Queues a scheduled post in Redis + schedules a QStash callback at the
 * exact UTC publish time. Works without QStash too — the daily Vercel
 * cron sweep at /api/cron/publish-scheduled will pick up the queue entry.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

  const body = (await req.json()) as Partial<ScheduledPost>;
  const { postId, mediaUrl, caption, presetId, platform, scheduledUtcMs } = body;

  if (!postId || !mediaUrl || !scheduledUtcMs) {
    return NextResponse.json(
      { error: "postId, mediaUrl, scheduledUtcMs required" },
      { status: 400 }
    );
  }
  if (scheduledUtcMs <= Date.now()) {
    return NextResponse.json({ error: "scheduledUtcMs must be in the future" }, { status: 400 });
  }

  const entry: ScheduledPost = {
    postId,
    userId: session.userId,
    mediaUrl,
    caption: caption ?? "",
    presetId: presetId ?? null,
    platform: platform === "facebook" ? "facebook" : "instagram",
    scheduledUtcMs,
    status: "pending",
    createdAt: Date.now(),
  };

  // TTL: keep for 7 days after scheduled time to allow status polling
  const ttlSec = Math.ceil((scheduledUtcMs - Date.now()) / 1000) + 7 * 86400;
  await redis.set(queueKey(session.userId, postId), JSON.stringify(entry), { ex: ttlSec });

  // Schedule a QStash callback at the exact publish time. If QSTASH_TOKEN
  // is unset (dev or pre-launch), the entry sits in Redis and the daily
  // Vercel cron sweep will pick it up.
  const qstashToken = process.env.QSTASH_TOKEN;
  if (qstashToken) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.convra.net";
    const callbackUrl = `${appUrl}/api/cron/publish-scheduled`;
    const delaySeconds = Math.max(1, Math.floor((scheduledUtcMs - Date.now()) / 1000));
    try {
      const qstash = new QStashClient({ token: qstashToken });
      await qstash.publishJSON({
        url: callbackUrl,
        body: { userId: session.userId, postId },
        delay: delaySeconds,
        retries: 3,
      });
    } catch (err) {
      console.error("[schedule] QStash publish failed:", err);
      // Don't fail the user request — Redis entry will be swept by cron.
    }
  } else {
    console.warn("[schedule] QSTASH_TOKEN not set — relying on daily cron fallback only");
  }

  return NextResponse.json({ queued: true, postId });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });
  const postId = req.nextUrl.searchParams.get("postId");
  if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
  const raw = await redis.get(queueKey(session.userId, postId));
  if (!raw) return NextResponse.json({ found: false });
  const entry: ScheduledPost =
    typeof raw === "string" ? JSON.parse(raw) : (raw as ScheduledPost);
  return NextResponse.json({ found: true, ...entry });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });
  const postId = req.nextUrl.searchParams.get("postId");
  if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
  await redis.del(queueKey(session.userId, postId));
  return NextResponse.json({ cancelled: true });
}
