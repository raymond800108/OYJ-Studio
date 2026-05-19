import { NextRequest, NextResponse } from "next/server";
import { Client as QStashClient } from "@upstash/qstash";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

export interface ScheduledPost {
  postId: string;
  userId: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  /** Slides 2..N for IG carousel. */
  carouselUrls?: string[];
  /** Per-slide kind, same length as carouselUrls. */
  carouselTypes?: ("image" | "video")[];
  caption: string;
  presetId: string | null;
  platform: "instagram" | "facebook";
  /** Original user-picked wall-clock — kept for UI display only. */
  scheduledDate?: string;     // "YYYY-MM-DD"
  scheduledTime?: string;     // "HH:MM"
  scheduledTimezone?: string; // IANA
  scheduledUtcMs: number;     // computed authoritative trigger time
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
  const {
    postId,
    mediaUrl,
    mediaType,
    carouselUrls,
    carouselTypes,
    caption,
    presetId,
    platform,
    scheduledDate,
    scheduledTime,
    scheduledTimezone,
    scheduledUtcMs,
  } = body;

  if (!postId || !mediaUrl || !scheduledUtcMs || !mediaType) {
    return NextResponse.json(
      { error: "postId, mediaUrl, mediaType, scheduledUtcMs required" },
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
    mediaType,
    carouselUrls: carouselUrls && carouselUrls.length > 0 ? carouselUrls : undefined,
    carouselTypes: carouselTypes && carouselTypes.length > 0 ? carouselTypes : undefined,
    caption: caption ?? "",
    presetId: presetId ?? null,
    platform: platform === "facebook" ? "facebook" : "instagram",
    scheduledDate,
    scheduledTime,
    scheduledTimezone,
    scheduledUtcMs,
    status: "pending",
    createdAt: Date.now(),
  };

  const ttlSec = Math.ceil((scheduledUtcMs - Date.now()) / 1000) + 7 * 86400;
  await redis.set(queueKey(session.userId, postId), JSON.stringify(entry), { ex: ttlSec });

  // Schedule a QStash callback at the exact publish time.
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
      // Redis entry remains — daily cron sweep is the safety net.
    }
  } else {
    console.warn("[schedule] QSTASH_TOKEN not set — relying on daily cron fallback");
  }

  return NextResponse.json({ queued: true, postId, scheduledUtcMs });
}

/**
 * GET /api/instagram/schedule
 *   ?postId=...  → single queue entry
 *   (no params)  → list all of this user's queue entries
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

  const postId = req.nextUrl.searchParams.get("postId");
  if (postId) {
    const raw = await redis.get(queueKey(session.userId, postId));
    if (!raw) return NextResponse.json({ found: false });
    const entry: ScheduledPost =
      typeof raw === "string" ? JSON.parse(raw) : (raw as ScheduledPost);
    return NextResponse.json({ found: true, ...entry });
  }

  // List all — Upstash Redis SCAN with pattern
  const pattern = `ig:queue:${session.userId}:*`;
  const keys: string[] = [];
  let cursor: string | number = 0;
  do {
    const result = (await redis.scan(cursor, { match: pattern, count: 100 })) as
      | [string, string[]]
      | { cursor: string; keys: string[] };
    // Upstash returns object form; fallback for tuple
    if (Array.isArray(result)) {
      cursor = result[0];
      keys.push(...result[1]);
    } else {
      cursor = result.cursor;
      keys.push(...result.keys);
    }
  } while (String(cursor) !== "0");

  if (keys.length === 0) return NextResponse.json({ posts: [] });

  const values = await Promise.all(keys.map((k) => redis.get(k)));
  const posts = values
    .map((v) => (v ? (typeof v === "string" ? JSON.parse(v) : (v as ScheduledPost)) : null))
    .filter(Boolean) as ScheduledPost[];

  return NextResponse.json({ posts });
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
