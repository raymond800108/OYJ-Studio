import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { requireAuth } from "@/lib/withAuth";

// MMAudio renders audio at roughly 1x realtime — a 6-second video usually
// finishes in 30-60s. We poll synchronously here rather than expose a
// separate queue/poll pair because the orbit page already shows a single
// "music" phase to the user.
export const maxDuration = 300;

const MODEL_ID = "fal-ai/mmaudio-v2";

/**
 * POST /api/fal/mmaudio
 * Body: {
 *   video_url: string,   // the silent orbit video we want to score
 *   prompt: string,      // motion-style-specific music description
 *   duration?: number,   // seconds (default 6, matches orbit video length)
 *   num_steps?: number,  // 25 default; lower = faster, less polished
 *   cfg_strength?: number, // 4.5 default; higher = closer to prompt
 * }
 *
 * Returns: { url: string }  // public fal URL of the new video-with-audio
 *
 * MMAudio mixes a fresh audio track synced to the supplied video. It does
 * NOT replace any existing audio — orbit videos are silent so the output
 * is video + the generated music. We re-host the result on fal.storage
 * (mmaudio already returns a fal.media URL, so it's already public).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth("video-generate");
  if (auth.error) return auth.error;

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return NextResponse.json({ error: "FAL_KEY not configured" }, { status: 500 });
  }
  fal.config({ credentials: falKey });

  const body = (await req.json()) as {
    video_url?: string;
    prompt?: string;
    duration?: number;
    num_steps?: number;
    cfg_strength?: number;
  };

  const video_url = body.video_url;
  const prompt = (body.prompt ?? "").trim();
  if (!video_url || !prompt) {
    return NextResponse.json({ error: "video_url and prompt required" }, { status: 400 });
  }

  try {
    const result = await fal.subscribe(MODEL_ID, {
      input: {
        video_url,
        prompt,
        duration: body.duration ?? 6,
        num_steps: body.num_steps ?? 25,
        cfg_strength: body.cfg_strength ?? 4.5,
        // negative_prompt left blank — the per-style prompt already states
        // "no vocals" / "commercial instrumental" when needed.
      },
      logs: false,
    });

    // The result shape: { data: { video: { url } } } or similar — defensive read.
    const data = (result as { data?: Record<string, unknown> }).data ??
      (result as Record<string, unknown>);
    type VideoOut = { url?: string };
    const videoOut: VideoOut | undefined =
      ((data as Record<string, unknown>).video as VideoOut | undefined) ??
      ((data as Record<string, unknown>).output as VideoOut | undefined);
    const url = videoOut?.url ?? (data as { url?: string }).url;
    if (!url || typeof url !== "string") {
      console.error("[mmaudio] unexpected response shape:", JSON.stringify(result).slice(0, 500));
      return NextResponse.json(
        { error: "MMAudio returned no video url" },
        { status: 502 }
      );
    }
    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "MMAudio generation failed";
    console.error("[mmaudio]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
