import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

// Video container polling can take up to 5 min — Vercel's 60s default kills it.
export const maxDuration = 300;

const IG_GRAPH = "https://graph.instagram.com";

interface IgConnection {
  instagram_user_id: string;
  instagram_username: string;
  access_token: string;
  token_expires_at: number;
  connected_at: number;
}

function igMediaType(presetId?: string | null): "REELS" | "STORIES" | null {
  if (!presetId) return null;
  const id = presetId.toLowerCase();
  if (id.includes("reel")) return "REELS";
  if (id.includes("story")) return "STORIES";
  return null;
}

async function waitForContainer(
  containerId: string,
  token: string,
  maxWaitMs = 300_000
): Promise<{ ready: boolean; error?: string }> {
  const start = Date.now();
  const pollInterval = 5000;
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const res = await fetch(`${IG_GRAPH}/${containerId}?fields=status_code`, {
      headers: { Authorization: `OAuth ${token}` },
    });
    const data = (await res.json()) as { status_code?: string; error?: { message: string } };
    if (data.error) return { ready: false, error: data.error.message };
    if (data.status_code === "FINISHED") return { ready: true };
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      return { ready: false, error: `Container ${data.status_code.toLowerCase()}` };
    }
  }
  return { ready: false, error: "Video processing timed out after 5 minutes" };
}

/**
 * POST /api/instagram/publish
 * Body: { mediaUrl, mediaType: "image" | "video", caption, presetId? }
 *
 * 2-step Instagram Graph API flow: create container → poll → media_publish.
 * Requires `instagram_business_content_publish` scope on the stored token.
 * Token transported via `Authorization: OAuth <token>` (kept out of logs).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

  const { userId } = session;
  const rawConn = await redis.get(`ig:${userId}`);
  if (!rawConn) return NextResponse.json({ error: "instagram_not_connected" }, { status: 401 });
  const conn: IgConnection =
    typeof rawConn === "string" ? JSON.parse(rawConn) : (rawConn as IgConnection);
  const { instagram_user_id, access_token } = conn;

  const body = (await req.json()) as {
    mediaUrl: string;
    mediaType: "image" | "video";
    caption?: string;
    presetId?: string | null;
  };
  const { mediaUrl, mediaType, caption = "", presetId } = body;
  if (!mediaUrl) return NextResponse.json({ error: "mediaUrl required" }, { status: 400 });

  const override = igMediaType(presetId);
  const isVideo = mediaType === "video" || override === "REELS";
  const isStory = override === "STORIES";

  try {
    /* ─── Step 1: create container ─────────────────────────────── */
    const params = new URLSearchParams({ access_token });
    if (caption) params.set("caption", caption);

    if (isVideo && !isStory) {
      params.set("media_type", "REELS");
      params.set("video_url", mediaUrl);
    } else if (isStory && isVideo) {
      params.set("media_type", "STORIES");
      params.set("video_url", mediaUrl);
    } else if (isStory) {
      params.set("media_type", "STORIES");
      params.set("image_url", mediaUrl);
    } else {
      params.set("image_url", mediaUrl);
    }

    const containerRes = await fetch(`${IG_GRAPH}/${instagram_user_id}/media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `OAuth ${access_token}`,
      },
      body: params.toString(),
    });
    const containerData = (await containerRes.json()) as {
      id?: string;
      error?: { code: number; message: string };
    };
    if (containerData.error) {
      if (containerData.error.code === 190) {
        await redis.del(`ig:${userId}`);
        return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 401 });
      }
      if (containerData.error.code === 10) {
        return NextResponse.json(
          {
            error:
              "Instagram account needs to re-authorize with publishing permission. Please disconnect and reconnect your Instagram.",
            code: "SCOPE_MISSING",
          },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: containerData.error.message }, { status: 502 });
    }

    const containerId = containerData.id!;

    /* ─── Step 2: poll container until FINISHED ────────────────── */
    const maxWait = isVideo ? 300_000 : 30_000;
    const { ready, error } = await waitForContainer(containerId, access_token, maxWait);
    if (!ready) {
      return NextResponse.json({ error: error ?? "Media processing failed" }, { status: 502 });
    }

    /* ─── Step 3: publish ──────────────────────────────────────── */
    const publishRes = await fetch(`${IG_GRAPH}/${instagram_user_id}/media_publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `OAuth ${access_token}`,
      },
      body: new URLSearchParams({ creation_id: containerId }).toString(),
    });
    const publishData = (await publishRes.json()) as {
      id?: string;
      error?: { code: number; message: string };
    };
    if (publishData.error) {
      return NextResponse.json({ error: publishData.error.message }, { status: 502 });
    }
    return NextResponse.json({ postId: publishData.id, platform: "instagram" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[instagram/publish]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
