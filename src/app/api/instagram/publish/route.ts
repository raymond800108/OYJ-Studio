import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";

// Video container polling can take up to 5 min — Vercel's 60s default kills it.
// 800s — long enough to poll multiple video carousel children (each up
// to 5 min on Meta's side) plus the parent CAROUSEL container.
export const maxDuration = 800;

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
 * IMPORTANT: the IG Container Graph object only exposes a small set of
 * queryable fields — `id`, `status_code`, `status`. Asking for anything
 * else (error, media_type, ...) returns 'Tried accessing nonexisting
 * field' and we lose the real error. We therefore track is-carousel-ness
 * at the call site rather than asking Meta.
 */
/**
 * When IG returns a bare "ERROR" or "EXPIRED" with no descriptive
 * `status` text (common for video processing failures), surface the
 * usual root causes so the user has something to fix.
 */
const VIDEO_REQUIREMENTS_HINT =
  "Single Reels: H.264 + AAC, aspect 9:16-4:5, 3s-15min. " +
  "Carousel video child: H.264 + AAC, aspect 1.91:1-4:5, max 60s (no 9:16 portrait!). " +
  "Phone-camera HEVC/H.265 MOV is the most common cause.";

const IMAGE_REQUIREMENTS_HINT =
  "Feed images need JPEG, aspect ratio 4:5 to 1.91:1, 320-1440px wide, max 8MB.";

async function describeContainerError(
  containerId: string,
  isCarousel: boolean,
  hasAnyVideo: boolean,
  token: string
): Promise<string> {
  try {
    const parentRes = await fetch(
      `${IG_GRAPH}/${containerId}?fields=id,status_code,status`,
      { headers: { Authorization: `OAuth ${token}` } }
    );
    const parent = (await parentRes.json()) as ContainerInfo;
    console.error("[ig-publish] parent container detail:", parent);
    const parentMsg = parent.status?.trim();

    if (isCarousel) {
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
      const offending = (childrenData.data ?? []).find(
        (c) => c.status_code === "ERROR" || c.status_code === "EXPIRED"
      );
      const offMsg = offending?.status?.trim();
      if (offMsg && offMsg !== "ERROR") {
        return `Slide error: ${offMsg}`;
      }
    }

    // Bare ERROR/EXPIRED with no useful text → append a concrete hint
    if (!parentMsg || parentMsg.toUpperCase() === "ERROR") {
      return hasAnyVideo ? VIDEO_REQUIREMENTS_HINT : IMAGE_REQUIREMENTS_HINT;
    }

    return parentMsg;
  } catch (e) {
    console.error("[ig-publish] describeContainerError failed:", e);
    return "ERROR (introspection failed)";
  }
}

async function waitForContainer(
  containerId: string,
  isCarousel: boolean,
  hasAnyVideo: boolean,
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
      const detail = await describeContainerError(
        containerId,
        isCarousel,
        hasAnyVideo,
        token
      );
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
     * Optional: slides 2..N for an IG CAROUSEL. IG supports mixed
     * image+video carousels — each slide gets its own child container
     * and we pick image_url vs video_url + media_type=VIDEO accordingly.
     */
    carouselUrls?: string[];
    /** Per-slide kind matching carouselUrls. Defaults to "image". */
    carouselTypes?: ("image" | "video")[];
    caption?: string;
    presetId?: string | null;
  };
  const { mediaUrl, mediaType, caption = "", presetId } = body;
  const carouselUrls = (body.carouselUrls ?? []).filter(Boolean).slice(0, 9);
  const carouselTypes = (body.carouselTypes ?? []).slice(0, carouselUrls.length);
  if (!mediaUrl) return NextResponse.json({ error: "mediaUrl required" }, { status: 400 });

  const override = igMediaType(presetId);
  const isStory = override === "STORIES";
  const isCarousel = carouselUrls.length > 0 && !isStory;
  // Single video (no extra slides) → REELS path. Single video that's a
  // story → STORIES + video_url. Mixed-media carousels are handled in
  // the carousel branch below.
  const isVideo = !isCarousel && (mediaType === "video" || override === "REELS");

  // Build the full slide list once so the carousel branch can iterate.
  const slides: { url: string; kind: "image" | "video" }[] = isCarousel
    ? [
        { url: mediaUrl, kind: mediaType },
        ...carouselUrls.map((url, i) => ({
          url,
          kind: (carouselTypes[i] ?? "image") as "image" | "video",
        })),
      ]
    : [];

  /**
   * Map Meta's container-error response to a Convra HTTP response.
   * Used by both the single-media path and each carousel child create.
   */
  function mapContainerError(
    err: {
      code?: number;
      message?: string;
      error_subcode?: number;
      error_user_msg?: string;
      error_user_title?: string;
      type?: string;
      fbtrace_id?: string;
    },
    where: string
  ): NextResponse {
    // Dump everything Meta said for ops debugging — Meta sometimes only
    // puts useful info in error_user_msg / error_subcode while the visible
    // `message` is just "An unexpected error has occurred".
    console.error(`[ig-publish] Meta error at ${where}:`, JSON.stringify(err));

    if (err.code === 190) {
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

    const userMsg = err.error_user_msg || err.message || "Unknown error";
    const code = err.code ?? "?";
    const subcode = err.error_subcode ? ` / sub ${err.error_subcode}` : "";
    return NextResponse.json(
      { error: `IG ${where} (code ${code}${subcode}): ${userMsg}` },
      { status: 502 }
    );
  }

  try {
    let containerId: string;

    if (isCarousel) {
      /* ─── Carousel: per-slide child container, then a CAROUSEL parent ──
       * IMPORTANT: each child container must finish processing on Meta's
       * side BEFORE we create the parent. Otherwise Meta returns
       * code 2 (API_SERVICE) "An unexpected error has occurred" because
       * the parent references children that aren't ready yet.
       */
      const childIds: string[] = [];
      const carouselHasVideo = slides.some((s) => s.kind === "video");

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
        if (childData.error) return mapContainerError(childData.error, `carousel-child[${slide.kind}]`);
        if (!childData.id) {
          return NextResponse.json(
            { error: "Failed to create carousel child container" },
            { status: 502 }
          );
        }

        // Wait for THIS child to reach FINISHED before creating the next /
        // the parent. Use the long timeout for video children since IG
        // transcoding can take a minute or two.
        const childMax = slide.kind === "video" ? 300_000 : 60_000;
        console.log(
          `[ig-publish] waiting on carousel child ${childData.id} (${slide.kind})`
        );
        const childWait = await waitForContainer(
          childData.id,
          false,
          slide.kind === "video",
          access_token,
          childMax
        );
        if (!childWait.ready) {
          return NextResponse.json(
            { error: `Carousel ${slide.kind} child not ready: ${childWait.error}` },
            { status: 502 }
          );
        }
        childIds.push(childData.id);
      }

      // Now all children are FINISHED — safe to create the parent.
      const parentParams = new URLSearchParams({
        access_token,
        media_type: "CAROUSEL",
        children: childIds.join(","),
      });
      // Silence "carouselHasVideo unused" — kept for future log/messaging
      void carouselHasVideo;
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
      if (parentData.error) return mapContainerError(parentData.error, "carousel-parent");
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
      if (containerData.error) return mapContainerError(containerData.error, "single-container");
      if (!containerData.id) {
        return NextResponse.json(
          { error: "Failed to create media container" },
          { status: 502 }
        );
      }
      containerId = containerData.id;
    }

    /* ─── Step 2: poll container until FINISHED ────────────────── */
    // Carousels with any video child need the same patience as a single video.
    const hasAnyVideo =
      isVideo || slides.some((s) => s.kind === "video");
    const maxWait = hasAnyVideo ? 300_000 : 30_000;
    console.log(
      `[ig-publish] polling container ${containerId} (isCarousel=${isCarousel} hasAnyVideo=${hasAnyVideo} mediaUrl=${mediaUrl})`
    );
    const { ready, error } = await waitForContainer(
      containerId,
      isCarousel,
      hasAnyVideo,
      access_token,
      maxWait
    );
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
