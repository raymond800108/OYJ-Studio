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

interface ContainerInfo {
  id?: string;
  status_code?: string;
  status?: string;
  error?: { message?: string; error_user_msg?: string; error_subcode?: number };
}

/**
 * Inspect the failed parent container (and its children if it's a CAROUSEL)
 * to extract the most specific human-readable reason Meta will give us.
 *
 * The CAROUSEL parent's `status_code=ERROR` often has an empty `status`
 * field even though one of its child containers has the real reason. We
 * walk the children to surface that.
 */
async function describeContainerError(
  containerId: string,
  token: string
): Promise<string> {
  try {
    const parentRes = await fetch(
      `${IG_GRAPH}/${containerId}?fields=id,status_code,status,media_type`,
      { headers: { Authorization: `OAuth ${token}` } }
    );
    const parent = (await parentRes.json()) as ContainerInfo & {
      media_type?: string;
    };
    console.error("[ig-publish] parent container detail:", parent);

    const parentMsg =
      parent.error?.error_user_msg ||
      parent.error?.message ||
      parent.status?.trim();

    // If it's a carousel, walk children too
    if (parent.media_type === "CAROUSEL") {
      const childrenRes = await fetch(
        `${IG_GRAPH}/${containerId}/children?fields=id,status_code,status`,
        { headers: { Authorization: `OAuth ${token}` } }
      );
      const childrenData = (await childrenRes.json()) as {
        data?: ContainerInfo[];
      };
      console.error(
        "[ig-publish] carousel children detail:",
        childrenData.data
      );
      for (const child of childrenData.data ?? []) {
        if (child.status_code === "ERROR" || child.error) {
          const childMsg =
            child.error?.error_user_msg ||
            child.error?.message ||
            child.status?.trim();
          if (childMsg) {
            return `Slide error: ${childMsg}`;
          }
        }
      }
    }

    return parentMsg || "Meta returned ERROR with no detail";
  } catch (e) {
    console.error("[ig-publish] describeContainerError failed:", e);
    return "ERROR (introspection failed)";
  }
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
    const res = await fetch(
      `${IG_GRAPH}/${containerId}?fields=status_code,status`,
      { headers: { Authorization: `OAuth ${token}` } }
    );
    const data = (await res.json()) as ContainerInfo;
    if (data.error) return { ready: false, error: data.error.message };
    if (data.status_code === "FINISHED") return { ready: true };
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      const detail = await describeContainerError(containerId, token);
      return { ready: false, error: `IG ${data.status_code}: ${detail}` };
    }
  }
  return { ready: false, error: "Media processing timed out after 5 minutes" };
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
  const { access_token } = conn;

  // SAFETY NET: IG user IDs are 17 digits — JSON-number parsing can silently round
  // the last digit. Always re-resolve the canonical ID from /me before publishing.
  // If it differs from what's stored, update Redis so future calls are correct.
  let instagram_user_id = conn.instagram_user_id ? String(conn.instagram_user_id) : "";
  try {
    const meRes = await fetch(
      `${IG_GRAPH}/me?fields=id,username&access_token=${access_token}`
    );
    const meData = (await meRes.json()) as {
      id?: string | number;
      username?: string;
      error?: { message: string };
    };
    if (meData.id) {
      const liveId = String(meData.id);
      if (liveId !== instagram_user_id) {
        instagram_user_id = liveId;
        await redis.set(
          `ig:${userId}`,
          JSON.stringify({
            ...conn,
            instagram_user_id: liveId,
            instagram_username: meData.username || conn.instagram_username,
          })
        );
      }
    }
  } catch {
    // Fall back to stored ID — publish step will surface any real auth error.
  }
  if (!instagram_user_id) {
    return NextResponse.json({ error: "instagram_not_connected" }, { status: 401 });
  }

  const body = (await req.json()) as {
    mediaUrl: string;
    mediaType: "image" | "video";
    /**
     * Optional: additional image URLs to publish as an IG CAROUSEL.
     * mediaUrl is the first slide; carouselUrls is slide 2..N (max 9
     * extra → 10 total). Carousels are images only — videos in
     * carousels need a separate flow we haven't built yet.
     */
    carouselUrls?: string[];
    caption?: string;
    presetId?: string | null;
  };
  const { mediaUrl, mediaType, caption = "", presetId } = body;
  const carouselUrls = (body.carouselUrls ?? []).filter(Boolean).slice(0, 9);
  if (!mediaUrl) return NextResponse.json({ error: "mediaUrl required" }, { status: 400 });

  const override = igMediaType(presetId);
  const isVideo = mediaType === "video" || override === "REELS";
  const isStory = override === "STORIES";
  const isCarousel = carouselUrls.length > 0 && !isVideo && !isStory;

  /**
   * Map Meta's container-error response to a Convra HTTP response.
   * Used by both the single-media path and each carousel child create.
   */
  function mapContainerError(
    err: { code: number; message: string }
  ): NextResponse {
    if (err.code === 190) {
      // redis is guaranteed non-null by the early-return above, but the
      // narrowing doesn't flow into this nested function — re-check.
      if (redis) void redis.del(`ig:${userId}`);
      return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 401 });
    }
    if (err.code === 10) {
      return NextResponse.json(
        {
          error:
            "Instagram account needs to re-authorize with publishing permission. Please disconnect and reconnect your Instagram.",
          code: "SCOPE_MISSING",
        },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  try {
    let containerId: string;

    if (isCarousel) {
      /* ─── Carousel: create child container per image, then a CAROUSEL parent ── */
      const allUrls = [mediaUrl, ...carouselUrls];

      // Create children sequentially (avoid rate limits) and capture the first error.
      const childIds: string[] = [];
      for (const url of allUrls) {
        const childParams = new URLSearchParams({
          access_token,
          image_url: url,
          is_carousel_item: "true",
        });
        const childRes = await fetch(`${IG_GRAPH}/${instagram_user_id}/media`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `OAuth ${access_token}`,
          },
          body: childParams.toString(),
        });
        const childData = (await childRes.json()) as {
          id?: string;
          error?: { code: number; message: string };
        };
        if (childData.error) return mapContainerError(childData.error);
        if (!childData.id) {
          return NextResponse.json(
            { error: "Failed to create carousel child container" },
            { status: 502 }
          );
        }
        childIds.push(childData.id);
      }

      // Create the carousel parent container with caption + children list
      const parentParams = new URLSearchParams({
        access_token,
        media_type: "CAROUSEL",
        children: childIds.join(","),
      });
      if (caption) parentParams.set("caption", caption);
      const parentRes = await fetch(`${IG_GRAPH}/${instagram_user_id}/media`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `OAuth ${access_token}`,
        },
        body: parentParams.toString(),
      });
      const parentData = (await parentRes.json()) as {
        id?: string;
        error?: { code: number; message: string };
      };
      if (parentData.error) return mapContainerError(parentData.error);
      if (!parentData.id) {
        return NextResponse.json(
          { error: "Failed to create carousel container" },
          { status: 502 }
        );
      }
      containerId = parentData.id;
    } else {
      /* ─── Single-media: image / video / story ──────────────────────── */
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
      if (containerData.error) return mapContainerError(containerData.error);
      if (!containerData.id) {
        return NextResponse.json(
          { error: "Failed to create media container" },
          { status: 502 }
        );
      }
      containerId = containerData.id;
    }

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
