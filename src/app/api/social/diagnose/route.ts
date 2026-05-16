import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import OpenAI from "openai";

interface IgConnection {
  instagram_user_id: string;
  instagram_username: string;
  access_token: string;
  token_expires_at: number;
  connected_at: number;
}

interface IgPost {
  id: string;
  caption?: string;
  media_type: string;
  timestamp: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
  reach?: number;
  impressions?: number;
  saved?: number;
  shares?: number;
  video_views?: number;
  save_rate?: number;
  engagement_rate?: number;
}

interface DiagnosisInsight {
  insight: string;
  evidence: string;
}

interface DiagnosisResult {
  whats_working: DiagnosisInsight[];
  whats_not_working: DiagnosisInsight[];
  audience_insight: string;
  best_posting_time: { day: string; time: string; evidence: string };
  top_post: { caption_excerpt: string; reach: number; save_rate: number; why: string };
  recommendation: {
    format: string;
    visual_direction: string;
    caption_strategy: string;
    hook: string;
    timing: string;
    audience_target: string;
    rationale: string;
  };
  generation_prompt: string;
}

const DIAGNOSIS_TTL = 60 * 60 * 6; // 6 hours

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: "Storage not configured." }, { status: 500 });
  }

  // Check cache
  const cached = await redis.get(`ig:diagnosis:${session.userId}`);
  if (cached) {
    const result: DiagnosisResult = typeof cached === "string" ? JSON.parse(cached) : (cached as DiagnosisResult);
    return NextResponse.json(result);
  }

  // Load IG connection
  const raw = await redis.get(`ig:${session.userId}`);
  if (!raw) {
    return NextResponse.json({ error: "Instagram not connected." }, { status: 400 });
  }
  const conn: IgConnection = typeof raw === "string" ? JSON.parse(raw) : (raw as IgConnection);

  const { access_token: token } = conn;

  // SAFETY NET: 17-digit IG IDs exceed JS Number.MAX_SAFE_INTEGER. If the id was
  // stored as a JSON number before the callback fix, the last digit is rounded.
  // Re-resolve canonical id via /me and self-heal Redis.
  let igUserId = conn.instagram_user_id ? String(conn.instagram_user_id) : "";
  try {
    const meRes = await fetch(
      `https://graph.instagram.com/me?fields=id,username&access_token=${token}`
    );
    const meData = await meRes.json();
    if (meData?.id) {
      const liveId = String(meData.id);
      if (liveId !== igUserId) {
        igUserId = liveId;
        await redis.set(
          `ig:${session.userId}`,
          JSON.stringify({
            ...conn,
            instagram_user_id: liveId,
            instagram_username: meData.username || conn.instagram_username,
          })
        );
      }
    }
  } catch {
    // Fall back to stored id; downstream fetch will surface real auth errors.
  }
  if (!igUserId) {
    return NextResponse.json({ error: "Instagram not connected." }, { status: 400 });
  }

  // Fetch posts
  let posts: IgPost[] = [];
  try {
    const postsRes = await fetch(
      `https://graph.instagram.com/${igUserId}/media?fields=id,caption,media_type,timestamp,permalink,like_count,comments_count&limit=30&access_token=${token}`
    );
    const postsData = await postsRes.json();

    if (postsData.error) {
      // Token expired?
      if (postsData.error.code === 190) {
        await redis.del(`ig:${session.userId}`);
        return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 401 });
      }
      return NextResponse.json({ error: postsData.error.message || "Failed to fetch posts." }, { status: 400 });
    }

    posts = (postsData.data || []) as IgPost[];
  } catch (err) {
    console.error("[diagnose] Posts fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch posts." }, { status: 500 });
  }

  // Fetch insights for each post in batches of 10
  const batches: IgPost[][] = [];
  for (let i = 0; i < posts.length; i += 10) {
    batches.push(posts.slice(i, i + 10));
  }

  const enrichedPosts: IgPost[] = [];

  for (const batch of batches) {
    await Promise.all(
      batch.map(async (post) => {
        const isVideo = post.media_type === "REEL" || post.media_type === "VIDEO";
        const metrics = ["reach", "impressions", "saved", "shares"];
        if (isVideo) metrics.push("video_views");

        try {
          const insightRes = await fetch(
            `https://graph.instagram.com/${post.id}/insights?metric=${metrics.join(",")}&access_token=${token}`
          );
          const insightData = await insightRes.json();

          if (insightData.error) {
            if (insightData.error.code === 190) {
              // Token expired — signal outer handler
              throw new Error("TOKEN_EXPIRED");
            }
            // Zero-defaults on other errors
            enrichedPosts.push({ ...post, reach: 0, impressions: 0, saved: 0, shares: 0, save_rate: 0, engagement_rate: 0 });
            return;
          }

          const metricsMap: Record<string, number> = {};
          for (const m of insightData.data || []) {
            metricsMap[m.name] = m.values?.[0]?.value ?? m.value ?? 0;
          }

          const reach = metricsMap["reach"] || 0;
          const saved = metricsMap["saved"] || 0;
          const shares = metricsMap["shares"] || 0;
          const likes = post.like_count || 0;
          const comments = post.comments_count || 0;
          const saveRate = reach > 0 ? saved / reach : 0;
          const engRate = reach > 0 ? (likes + comments + saved + shares) / reach : 0;

          enrichedPosts.push({
            ...post,
            reach,
            impressions: metricsMap["impressions"] || 0,
            saved,
            shares,
            video_views: metricsMap["video_views"],
            save_rate: saveRate,
            engagement_rate: engRate,
          });
        } catch (err) {
          if (err instanceof Error && err.message === "TOKEN_EXPIRED") {
            throw err;
          }
          // Zero-defaults
          enrichedPosts.push({ ...post, reach: 0, impressions: 0, saved: 0, shares: 0, save_rate: 0, engagement_rate: 0 });
        }
      })
    ).catch(async (err) => {
      if (err instanceof Error && err.message === "TOKEN_EXPIRED") {
        await redis.del(`ig:${session.userId}`);
        throw err;
      }
    });
  }

  // Handle token expiry propagated from batch
  // (error is re-thrown from catch above; catch it at route level)

  // Sort by reach DESC, take top 20
  const sorted = [...enrichedPosts].sort((a, b) => (b.reach || 0) - (a.reach || 0));
  const top20 = sorted.slice(0, 20);

  // Build summary for GPT
  const postSummary = top20.map((p, i) => ({
    rank: i + 1,
    type: p.media_type,
    caption_excerpt: (p.caption || "").slice(0, 150),
    timestamp: p.timestamp,
    reach: p.reach,
    saves: p.saved,
    likes: p.like_count,
    comments: p.comments_count,
    save_rate: p.save_rate ? `${(p.save_rate * 100).toFixed(2)}%` : "0%",
    engagement_rate: p.engagement_rate ? `${(p.engagement_rate * 100).toFixed(2)}%` : "0%",
    video_views: p.video_views,
  }));

  // GPT-4o diagnosis
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `You are a world-class Instagram growth strategist and data analyst. Analyse the provided Instagram post data and return a JSON diagnosis. Every insight MUST cite a specific number from the data. No generic advice. Output ONLY valid JSON — no markdown, no backticks.

JSON schema:
{
  "whats_working": [{"insight": "string", "evidence": "string"}],
  "whats_not_working": [{"insight": "string", "evidence": "string"}],
  "audience_insight": "string",
  "best_posting_time": {"day": "string", "time": "string", "evidence": "string"},
  "top_post": {"caption_excerpt": "string", "reach": number, "save_rate": number, "why": "string"},
  "recommendation": {
    "format": "string",
    "visual_direction": "string",
    "caption_strategy": "string",
    "hook": "string",
    "timing": "string",
    "audience_target": "string",
    "rationale": "string"
  },
  "generation_prompt": "string"
}

Rules:
- whats_working: 3-5 items, each citing a specific metric number
- whats_not_working: 2-4 items, each citing a specific metric number
- audience_insight: 1-2 sentences describing the audience based on posting patterns and engagement
- best_posting_time: derive from when top-performing posts were published
- top_post: the single highest-reach post
- recommendation: specific, actionable next post strategy
- generation_prompt: a detailed AI image generation prompt for the recommended next post visual`;

  const userPrompt = `Instagram account data — top ${top20.length} posts by reach:\n\n${JSON.stringify(postSummary, null, 2)}`;

  let diagnosis: DiagnosisResult;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content || "{}";
    diagnosis = JSON.parse(content) as DiagnosisResult;
  } catch (err) {
    console.error("[diagnose] GPT error:", err);
    return NextResponse.json({ error: "AI diagnosis failed. Please try again." }, { status: 500 });
  }

  // Cache result
  await redis.set(`ig:diagnosis:${session.userId}`, JSON.stringify(diagnosis), { ex: DIAGNOSIS_TTL });

  return NextResponse.json(diagnosis);
}
