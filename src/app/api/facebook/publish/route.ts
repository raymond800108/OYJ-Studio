import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import type { MetaAdsConnection } from "@/app/api/auth/meta-ads/callback/route";
import type { FacebookPage } from "@/app/api/facebook/pages/route";

const FB_GRAPH = "https://graph.facebook.com/v19.0";

function fbMediaHint(presetId?: string | null): "reel" | "story" | null {
  if (!presetId) return null;
  const id = presetId.toLowerCase();
  if (id.includes("reel")) return "reel";
  if (id.includes("story")) return "story";
  return null;
}

async function getPageToken(
  userId: string,
  redis: NonNullable<ReturnType<typeof getRedis>>
): Promise<{ token: string; pageId: string } | null> {
  // 1h cache lookup
  const cached = await redis.get(`meta_ads:pages:${userId}`);
  if (cached) {
    const pages: FacebookPage[] = typeof cached === "string" ? JSON.parse(cached) : cached;
    if (pages[0]) return { token: pages[0].access_token, pageId: pages[0].id };
  }
  // Fetch on-demand
  const rawConn = await redis.get(`meta_ads:${userId}`);
  if (!rawConn) return null;
  const conn: MetaAdsConnection =
    typeof rawConn === "string" ? JSON.parse(rawConn) : (rawConn as MetaAdsConnection);
  const res = await fetch(
    `${FB_GRAPH}/me/accounts?fields=id,name,access_token&access_token=${conn.access_token}`
  );
  const data = (await res.json()) as { data?: FacebookPage[]; error?: unknown };
  if (!data.data?.[0]) return null;
  await redis.set(`meta_ads:pages:${userId}`, JSON.stringify(data.data), { ex: 3600 });
  return { token: data.data[0].access_token, pageId: data.data[0].id };
}

/**
 * POST /api/facebook/publish
 * Body: { mediaUrl, mediaType: "image" | "video", caption?, presetId?, pageId? }
 *
 * Image → POST /{pageId}/photos
 * Video / reel → POST /{pageId}/videos
 *
 * Requires Meta scopes: pages_show_list, pages_manage_posts.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });

  const { userId } = session;
  const body = (await req.json()) as {
    mediaUrl: string;
    mediaType: "image" | "video";
    caption?: string;
    presetId?: string | null;
    pageId?: string;
  };
  const { mediaUrl, mediaType, caption = "", presetId, pageId: bodyPageId } = body;
  if (!mediaUrl) return NextResponse.json({ error: "mediaUrl required" }, { status: 400 });

  try {
    const pg = await getPageToken(userId, redis);
    if (!pg) {
      return NextResponse.json(
        {
          error:
            "No Facebook Page found. Connect your Meta account and ensure you manage a Facebook Page.",
          code: "NO_PAGE",
        },
        { status: 403 }
      );
    }
    const pageId = bodyPageId || pg.pageId;
    const pageToken = pg.token;
    const isVideo = mediaType === "video" || fbMediaHint(presetId) === "reel";

    const endpoint = isVideo
      ? `${FB_GRAPH}/${pageId}/videos`
      : `${FB_GRAPH}/${pageId}/photos`;
    const postBody: Record<string, string> = isVideo
      ? { file_url: mediaUrl, description: caption, access_token: pageToken }
      : { url: mediaUrl, caption, access_token: pageToken };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(postBody).toString(),
    });
    const data = (await res.json()) as {
      id?: string;
      post_id?: string;
      error?: { code: number; message: string };
    };
    if (data.error) {
      if (data.error.code === 190) {
        await redis.del(`meta_ads:${userId}`);
        return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 401 });
      }
      if (data.error.code === 10 || data.error.code === 200) {
        return NextResponse.json(
          {
            error:
              "Missing pages_manage_posts permission. Please disconnect and reconnect your Meta account.",
            code: "SCOPE_MISSING",
          },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: data.error.message }, { status: 502 });
    }
    return NextResponse.json({ postId: data.post_id ?? data.id, platform: "facebook", pageId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[facebook/publish]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
