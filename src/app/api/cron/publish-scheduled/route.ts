import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { getRedis } from "@/lib/redis";
import type { ScheduledPost } from "@/app/api/instagram/schedule/route";

// Video container polling can take up to 5 min.
export const maxDuration = 300;

const IG_GRAPH = "https://graph.instagram.com";
const FB_GRAPH = "https://graph.facebook.com/v19.0";

interface IgConnection {
  instagram_user_id: string;
  access_token: string;
  token_expires_at: number;
}
interface MetaAdsConnection {
  access_token: string;
}

function igMediaType(presetId: string | null): "REELS" | "STORIES" | null {
  if (!presetId) return null;
  const id = presetId.toLowerCase();
  if (id.includes("reel")) return "REELS";
  if (id.includes("story")) return "STORIES";
  return null;
}

async function waitForContainer(
  containerId: string,
  token: string,
  maxWaitMs = 60_000
): Promise<{ ready: boolean; error?: string }> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fetch(
      `${IG_GRAPH}/${containerId}?fields=status_code&access_token=${token}`
    );
    const data = (await res.json()) as { status_code?: string; error?: { message: string } };
    if (data.error) return { ready: false, error: data.error.message };
    if (data.status_code === "FINISHED") return { ready: true };
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      return { ready: false, error: `Container ${data.status_code}` };
    }
  }
  return { ready: false, error: "Timed out waiting for media processing" };
}

type PublishResult = { postId: string } | { error: string; tokenExpired?: boolean };

async function publishToInstagram(
  entry: ScheduledPost,
  redis: NonNullable<ReturnType<typeof getRedis>>
): Promise<PublishResult> {
  const rawConn = await redis.get(`ig:${entry.userId}`);
  if (!rawConn) return { error: "Instagram not connected" };
  const conn: IgConnection =
    typeof rawConn === "string" ? JSON.parse(rawConn) : (rawConn as IgConnection);
  if (conn.token_expires_at < Date.now()) {
    await redis.del(`ig:${entry.userId}`);
    return { error: "Token expired", tokenExpired: true };
  }

  const { instagram_user_id, access_token } = conn;
  const override = igMediaType(entry.presetId);
  const isVideo =
    /\.(mp4|mov|avi|webm)$/i.test(entry.mediaUrl) || override === "REELS";
  const isStory = override === "STORIES";

  const params = new URLSearchParams({ access_token });
  if (entry.caption) params.set("caption", entry.caption);
  if (isVideo && !isStory) {
    params.set("media_type", "REELS");
    params.set("video_url", entry.mediaUrl);
  } else if (isStory && isVideo) {
    params.set("media_type", "STORIES");
    params.set("video_url", entry.mediaUrl);
  } else if (isStory) {
    params.set("media_type", "STORIES");
    params.set("image_url", entry.mediaUrl);
  } else {
    params.set("image_url", entry.mediaUrl);
  }

  const containerRes = await fetch(`${IG_GRAPH}/${instagram_user_id}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const containerData = (await containerRes.json()) as {
    id?: string;
    error?: { code: number; message: string };
  };
  if (containerData.error) {
    if (containerData.error.code === 190) {
      await redis.del(`ig:${entry.userId}`);
      return { error: "Token expired", tokenExpired: true };
    }
    return { error: containerData.error.message };
  }

  const containerId = containerData.id!;
  const { ready, error } = await waitForContainer(
    containerId,
    access_token,
    isVideo ? 300_000 : 30_000
  );
  if (!ready) return { error: error ?? "Media processing failed" };

  const publishRes = await fetch(`${IG_GRAPH}/${instagram_user_id}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: containerId, access_token }).toString(),
  });
  const publishData = (await publishRes.json()) as {
    id?: string;
    error?: { code: number; message: string };
  };
  if (publishData.error) return { error: publishData.error.message };
  return { postId: publishData.id! };
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
        : await publishToInstagram(entry, redis);

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
              : await publishToInstagram(entry, redis);
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
