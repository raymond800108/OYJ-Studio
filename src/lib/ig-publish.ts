import { getRedis } from "@/lib/redis";

const IG_GRAPH = "https://graph.instagram.com";

export interface IgPublishRequest {
  userId: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  caption?: string;
  carouselUrls?: string[];
  carouselTypes?: ("image" | "video")[];
  presetId?: string | null;
}

export interface IgPublishResult {
  ok: boolean;
  postId?: string;
  error?: string;
  tokenExpired?: boolean;
}

interface IgConnection {
  instagram_user_id: string;
  instagram_username?: string;
  access_token: string;
  token_expires_at: number;
}

interface ContainerInfo {
  id?: string;
  status_code?: string;
  status?: string;
  error?: { message?: string };
}

function igMediaTypeFromPreset(presetId?: string | null): "REELS" | "STORIES" | null {
  if (!presetId) return null;
  const id = presetId.toLowerCase();
  if (id.includes("reel")) return "REELS";
  if (id.includes("story")) return "STORIES";
  return null;
}

async function waitForContainer(
  containerId: string,
  hasAnyVideo: boolean,
  isCarousel: boolean,
  token: string
): Promise<{ ready: boolean; error?: string }> {
  const maxWaitMs = hasAnyVideo ? 240_000 : 30_000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 5_000));
    const res = await fetch(
      `${IG_GRAPH}/${containerId}?fields=status_code,status&access_token=${token}`
    );
    const data = (await res.json()) as ContainerInfo;
    if (data.error) return { ready: false, error: data.error.message };
    if (data.status_code === "FINISHED") return { ready: true };
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") {
      const reason = data.status?.trim();
      // Hint for bare "ERROR"
      if (!reason || reason.toUpperCase() === "ERROR") {
        const hint = hasAnyVideo
          ? "video needs H.264+AAC, 9:16-4:5 (Reels) or 1.91:1-4:5 (carousel), 3s-15min"
          : "image needs JPEG, aspect 4:5-1.91:1, 320-1440px wide";
        return { ready: false, error: `${data.status_code} (${hint})` };
      }
      // Walk carousel children for the real cause
      if (isCarousel) {
        try {
          const childRes = await fetch(
            `${IG_GRAPH}/${containerId}/children?fields=id,status_code,status&access_token=${token}`
          );
          const childData = (await childRes.json()) as { data?: ContainerInfo[] };
          const failed = (childData.data ?? []).find(
            (c) => c.status_code === "ERROR" || c.status_code === "EXPIRED"
          );
          if (failed?.status && failed.status.toUpperCase() !== "ERROR") {
            return { ready: false, error: `Slide: ${failed.status}` };
          }
        } catch {
          // swallow
        }
      }
      return { ready: false, error: `${data.status_code}: ${reason}` };
    }
  }
  return { ready: false, error: "Timed out waiting for IG to process media" };
}

/**
 * Self-heal corrupted 17-digit IG user IDs that lost precision during
 * JSON.parse before we added String() coercion in the OAuth callback.
 */
async function resolveIgUserId(conn: IgConnection, userId: string): Promise<string> {
  let igUserId = conn.instagram_user_id ? String(conn.instagram_user_id) : "";
  try {
    const meRes = await fetch(
      `${IG_GRAPH}/me?fields=id,username&access_token=${conn.access_token}`
    );
    const me = (await meRes.json()) as { id?: string | number; username?: string };
    if (me.id) {
      const live = String(me.id);
      if (live !== igUserId) {
        igUserId = live;
        const redis = getRedis();
        if (redis) {
          await redis.set(
            `ig:${userId}`,
            JSON.stringify({
              ...conn,
              instagram_user_id: live,
              instagram_username: me.username || conn.instagram_username,
            })
          );
        }
      }
    }
  } catch {
    /* fall back to stored id */
  }
  return igUserId;
}

/**
 * One source of truth for "publish a post to Instagram". Used by:
 *   - /api/instagram/publish (interactive "Publish now")
 *   - /api/cron/publish-scheduled (auto-publish a queued post)
 *
 * Handles: single image / single video (Reels) / mixed-media carousel.
 * Waits for child containers to FINISH before creating the CAROUSEL
 * parent (avoids code 2). Retries parent creation 3× on code 2.
 */
export async function publishToInstagram(
  req: IgPublishRequest
): Promise<IgPublishResult> {
  const redis = getRedis();
  if (!redis) return { ok: false, error: "Redis not configured" };

  const rawConn = await redis.get(`ig:${req.userId}`);
  if (!rawConn) return { ok: false, error: "Instagram not connected" };
  const conn: IgConnection =
    typeof rawConn === "string" ? JSON.parse(rawConn) : (rawConn as IgConnection);

  const igUserId = await resolveIgUserId(conn, req.userId);
  if (!igUserId) return { ok: false, error: "Instagram not connected" };
  const { access_token } = conn;

  const carouselUrls = (req.carouselUrls ?? []).filter(Boolean).slice(0, 9);
  const carouselTypes = (req.carouselTypes ?? []).slice(0, carouselUrls.length);

  const override = igMediaTypeFromPreset(req.presetId);
  const isStory = override === "STORIES";
  const isCarousel = carouselUrls.length > 0 && !isStory;
  const isVideo = !isCarousel && (req.mediaType === "video" || override === "REELS");

  const slides: { url: string; kind: "image" | "video" }[] = isCarousel
    ? [
        { url: req.mediaUrl, kind: req.mediaType },
        ...carouselUrls.map((url, i) => ({
          url,
          kind: (carouselTypes[i] ?? "image") as "image" | "video",
        })),
      ]
    : [];

  let containerId: string;

  try {
    if (isCarousel) {
      const childIds: string[] = [];
      for (const slide of slides) {
        const childParams = new URLSearchParams({
          access_token,
          is_carousel_item: "true",
        });
        if (slide.kind === "video") {
          childParams.set("media_type", "VIDEO");
          childParams.set("video_url", slide.url);
        } else {
          childParams.set("image_url", slide.url);
        }
        const childRes = await fetch(`${IG_GRAPH}/${igUserId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: childParams.toString(),
        });
        const childData = (await childRes.json()) as {
          id?: string;
          error?: { code: number; message: string };
        };
        if (childData.error) {
          if (childData.error.code === 190) {
            await redis.del(`ig:${req.userId}`);
            return { ok: false, error: "Token expired", tokenExpired: true };
          }
          return { ok: false, error: `child[${slide.kind}]: ${childData.error.message}` };
        }
        if (!childData.id) return { ok: false, error: "Empty child container response" };

        // Wait for child to finish before creating parent (else code 2)
        const childWait = await waitForContainer(
          childData.id,
          slide.kind === "video",
          false,
          access_token
        );
        if (!childWait.ready) {
          return { ok: false, error: `Carousel ${slide.kind} child not ready: ${childWait.error}` };
        }
        childIds.push(childData.id);
      }

      // Create parent — retry up to 3× on code 2 (transient)
      const parentParams = new URLSearchParams({
        access_token,
        media_type: "CAROUSEL",
        children: childIds.join(","),
      });
      if (req.caption) parentParams.set("caption", req.caption);

      let parentId: string | undefined;
      let lastError: { code: number; message: string } | undefined;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const parentRes = await fetch(`${IG_GRAPH}/${igUserId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: parentParams.toString(),
        });
        const parentData = (await parentRes.json()) as {
          id?: string;
          error?: { code: number; message: string };
        };
        if (parentData.id) {
          parentId = parentData.id;
          break;
        }
        lastError = parentData.error;
        if (!lastError || lastError.code !== 2) break;
        await new Promise((r) => setTimeout(r, 10_000));
      }
      if (!parentId) {
        if (lastError?.code === 190) {
          await redis.del(`ig:${req.userId}`);
          return { ok: false, error: "Token expired", tokenExpired: true };
        }
        return { ok: false, error: `parent: ${lastError?.message ?? "unknown"}` };
      }
      containerId = parentId;
    } else {
      // Single-media path
      const params = new URLSearchParams({ access_token });
      if (req.caption) params.set("caption", req.caption);
      if (isVideo && !isStory) {
        params.set("media_type", "REELS");
        params.set("video_url", req.mediaUrl);
      } else if (isStory && isVideo) {
        params.set("media_type", "STORIES");
        params.set("video_url", req.mediaUrl);
      } else if (isStory) {
        params.set("media_type", "STORIES");
        params.set("image_url", req.mediaUrl);
      } else {
        params.set("image_url", req.mediaUrl);
      }
      const res = await fetch(`${IG_GRAPH}/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const data = (await res.json()) as {
        id?: string;
        error?: { code: number; message: string };
      };
      if (data.error) {
        if (data.error.code === 190) {
          await redis.del(`ig:${req.userId}`);
          return { ok: false, error: "Token expired", tokenExpired: true };
        }
        return { ok: false, error: data.error.message };
      }
      if (!data.id) return { ok: false, error: "Empty container response" };
      containerId = data.id;
    }

    // Poll parent until finished
    const hasAnyVideo =
      isVideo || slides.some((s) => s.kind === "video");
    const wait = await waitForContainer(containerId, hasAnyVideo, isCarousel, access_token);
    if (!wait.ready) return { ok: false, error: wait.error ?? "Container not ready" };

    // Publish
    const publishRes = await fetch(`${IG_GRAPH}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: containerId, access_token }).toString(),
    });
    const publishData = (await publishRes.json()) as {
      id?: string;
      error?: { code: number; message: string };
    };
    if (publishData.error) return { ok: false, error: publishData.error.message };
    return { ok: true, postId: publishData.id };
  } catch (err) {
    console.error("[ig-publish lib] unexpected:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
