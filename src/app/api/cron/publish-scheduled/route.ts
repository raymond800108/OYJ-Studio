import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { getRedis } from "@/lib/redis";
import type { ScheduledPost } from "@/app/api/instagram/schedule/route";
import { publishToInstagram as publishIgViaLib } from "@/lib/ig-publish";

// Video container polling can take up to 5 min.
export const maxDuration = 300;

const FB_GRAPH = "https://graph.facebook.com/v19.0";

interface MetaAdsConnection {
  access_token: string;
}

type PublishResult = { postId: string } | { error: string; tokenExpired?: boolean };

/**
 * Thin adapter — the cron stores ScheduledPost in Redis, and the shared
 * lib in src/lib/ig-publish.ts takes an IgPublishRequest. Translate.
 */
async function publishToInstagram(
  entry: ScheduledPost
): Promise<PublishResult> {
  const result = await publishIgViaLib({
    userId: entry.userId,
    mediaUrl: entry.mediaUrl,
    mediaType: entry.mediaType,
    carouselUrls: entry.carouselUrls,
    carouselTypes: entry.carouselTypes,
    caption: entry.caption,
    presetId: entry.presetId,
  });
  if (result.ok && result.postId) return { postId: result.postId };
  return { error: result.error ?? "Unknown error", tokenExpired: result.tokenExpired };
}

async function publishToFacebook(
  entry: ScheduledPost,
  redis: NonNullable<ReturnType<typeof getRedis>>
): Promise<PublishResult> {
  const rawConn = await redis.get(`meta_ads:${entry.userId}`);
  if (!rawConn) return { error: "Facebook not connected" };
  const conn: MetaAdsConnection =
    typeof rawConn === "string" ? JSON.parse(rawConn) : (rawConn as MetaAdsConnection);

  const pagesRes = await fetch(
    `${FB_GRAPH}/me/accounts?fields=id,name,access_token&access_token=${conn.access_token}`
  );
  const pagesData = (await pagesRes.json()) as {
    data?: { id: string; access_token: string }[];
  };
  const page = pagesData.data?.[0];
  if (!page) return { error: "No Facebook Page found" };

  const isVideo = /\.(mp4|mov|avi|webm)$/i.test(entry.mediaUrl);
  const endpoint = isVideo
    ? `${FB_GRAPH}/${page.id}/videos`
    : `${FB_GRAPH}/${page.id}/photos`;
  const postParams = new URLSearchParams({ access_token: page.access_token });
  if (isVideo) {
    postParams.set("file_url", entry.mediaUrl);
    postParams.set("description", entry.caption);
  } else {
    postParams.set("url", entry.mediaUrl);
    postParams.set("caption", entry.caption);
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: postParams.toString(),
  });
  const data = (await res.json()) as {
    id?: string;
    post_id?: string;
    error?: { message: string };
  };
  if (data.error) return { error: data.error.message };
  return { postId: data.post_id ?? data.id ?? "unknown" };
}

/**
 * 3-path verification — QStash signature / CRON_SECRET / dev escape.
 * Reads body ONCE (req.text() is single-use). Fail-closed in production.
 */
async function verifyAndReadBody(
  req: NextRequest
): Promise<{ body: string; userId?: string; postId?: string } | null> {
  const raw = await req.text();
  const isDev = process.env.NODE_ENV !== "production";

  // Path A — QStash signed POST (preferred)
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  const signature = req.headers.get("upstash-signature");
  if (signature && currentKey) {
    try {
      const receiver = new Receiver({
        currentSigningKey: currentKey,
        nextSigningKey: nextKey ?? "",
      });
      const valid = await receiver.verify({ body: raw, signature });
      if (valid) {
        try {
          return { body: raw, ...JSON.parse(raw) };
        } catch {
          return { body: raw };
        }
      }
    } catch (err) {
      console.warn("[cron/publish-scheduled] QStash signature check failed:", err);
    }
  }

  // Path B — Vercel cron / manual curl with CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    try {
      return { body: raw, ...JSON.parse(raw) };
    } catch {
      return { body: raw };
    }
  }

  // Path C — dev escape hatch
  if (isDev) {
    try {
      return { body: raw, ...JSON.parse(raw) };
    } catch {
      return { body: raw };
    }
  }

  return null;
}

/* ─── POST: QStash callback for a specific post ───────────────── */
export async function POST(req: NextRequest) {
  const verified = await verifyAndReadBody(req);
  if (!verified) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

  const { userId, postId } = verified;
  if (!userId || !postId) {
    return NextResponse.json({ error: "userId and postId required" }, { status: 400 });
  }

  const key = `ig:queue:${userId}:${postId}`;
  const raw = await redis.get(key);
  if (!raw) return NextResponse.json({ error: "Post not found in queue" }, { status: 404 });
  const entry: ScheduledPost =
    typeof raw === "string" ? JSON.parse(raw) : (raw as ScheduledPost);
  if (entry.status !== "pending") {
    return NextResponse.json({ skipped: true, status: entry.status });
  }

  // Publish-lock — prevents the QStash retry + GET sweep race
  const acquired = await redis.set(`publish-lock:${postId}`, "1", { nx: true, ex: 600 });
  if (!acquired) {
    return NextResponse.json({ skipped: true, reason: "already publishing" });
  }

  try {
    const result =
      entry.platform === "facebook"
        ? await publishToFacebook(entry, redis)
        : await publishToInstagram(entry);

    if ("error" in result) {
      await redis.set(
        key,
        JSON.stringify({ ...entry, status: "failed", error: result.error }),
        { ex: 7 * 86400 }
      );
      return NextResponse.json({ ok: false, error: result.error });
    }
    await redis.set(
      key,
      JSON.stringify({
        ...entry,
        status: "published",
        publishedAt: Date.now(),
        metaPostId: result.postId,
      }),
      { ex: 7 * 86400 }
    );
    return NextResponse.json({ ok: true, metaPostId: result.postId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await redis.set(
      key,
      JSON.stringify({ ...entry, status: "failed", error: msg }),
      { ex: 7 * 86400 }
    );
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/* ─── GET: Vercel daily cron sweep ────────────────────────────── */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const isDev = process.env.NODE_ENV !== "production";
  if (!isDev && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDev && !cronSecret) {
    return NextResponse.json(
      { error: "Server misconfigured: CRON_SECRET unset" },
      { status: 500 }
    );
  }

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });
  const now = Date.now();
  const results = { scanned: 0, published: 0, failed: 0, skipped: 0 };

  try {
    let cursor: number | string = 0;
    do {
      const scanResult = (await redis.scan(cursor, { match: "ig:queue:*", count: 100 })) as
        | [string | number, string[]]
        | { cursor: number | string; keys: string[] };
      let next: string | number;
      let keys: string[];
      if (Array.isArray(scanResult)) {
        [next, keys] = scanResult;
      } else {
        next = scanResult.cursor;
        keys = scanResult.keys;
      }
      cursor = next;
      for (const key of keys) {
        results.scanned++;
        const raw = await redis.get(key);
        if (!raw) continue;
        const entry: ScheduledPost =
          typeof raw === "string" ? JSON.parse(raw) : (raw as ScheduledPost);
        if (entry.status !== "pending") {
          results.skipped++;
          continue;
        }
        if (entry.scheduledUtcMs > now) {
          results.skipped++;
          continue;
        }
        const acquired = await redis.set(`publish-lock:${entry.postId}`, "1", {
          nx: true,
          ex: 600,
        });
        if (!acquired) {
          results.skipped++;
          continue;
        }
        try {
          const result =
            entry.platform === "facebook"
              ? await publishToFacebook(entry, redis)
              : await publishToInstagram(entry);
          if ("error" in result) {
            await redis.set(
              key,
              JSON.stringify({ ...entry, status: "failed", error: result.error }),
              { ex: 7 * 86400 }
            );
            results.failed++;
          } else {
            await redis.set(
              key,
              JSON.stringify({
                ...entry,
                status: "published",
                publishedAt: Date.now(),
                metaPostId: result.postId,
              }),
              { ex: 7 * 86400 }
            );
            results.published++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await redis.set(
            key,
            JSON.stringify({ ...entry, status: "failed", error: msg }),
            { ex: 7 * 86400 }
          );
          results.failed++;
        }
      }
    } while (Number(cursor) !== 0);
    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
