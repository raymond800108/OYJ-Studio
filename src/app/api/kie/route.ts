import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/withAuth";

const KIE_BASE = "https://api.kie.ai/api/v1";

function getKey() {
  const key = process.env.KIE_API_KEY;
  if (!key) throw new Error("KIE_API_KEY environment variable is not set");
  return key;
}

function headers() {
  return {
    Authorization: `Bearer ${getKey()}`,
    "Content-Type": "application/json",
  };
}

// POST — create image or video generation task
export async function POST(req: NextRequest) {
  // Determine action type from body — default to image
  const bodyClone = req.clone();
  const { type: actionType } = await bodyClone.json().catch(() => ({ type: "image" }));
  const authResult = await requireAuth(actionType === "video" ? "video-generate" : "image-generate");
  if (authResult.error) return authResult.error;

  try {
    const body = await req.json();
    const {
      type = "image", // "image" | "video"
      model: requestedModel,  // optional model override (e.g. gpt-image-2-image-to-image)
      prompt,
      negative_prompt = "",
      aspect_ratio = "1:1",
      resolution = "2K",
      output_format = "jpg",
      // Image-specific — reference images for Nano Banana 2 (up to 14 URLs)
      image_input = [],
      // GPT-Image-2 uses a different param name (up to 16 URLs)
      input_urls = [],
      // Video-specific
      video_model = "kling-2.6",
      // Optional reference image for image-to-video (single)
      reference_image,
      // Optional array of reference images — anchors for video stitching.
      // Kling 3.0 uses first + last only; Seedance 2 Fast uses up to 9.
      reference_images,
      // Seedance-only — explicit keyframes (mutually exclusive with refs)
      first_frame_url,
      last_frame_url,
      // Seedance-only — optional audio refs
      reference_audio_urls = [],
      // Seedance-only — duration in seconds (number) and audio toggle
      duration,
      generate_audio,
    } = body;

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    let endpoint: string;
    let payload: Record<string, unknown>;

    if (type === "video") {
      endpoint = `${KIE_BASE}/jobs/createTask`;
      const refImageList: string[] = Array.isArray(reference_images)
        ? reference_images.filter((u: unknown): u is string => typeof u === "string" && u.length > 0)
        : reference_image
        ? [reference_image]
        : [];

      const input: Record<string, unknown> = { prompt };
      let model: string;

      const isSeedance =
        video_model === "seedance-2-fast" || video_model === "seedance-2";

      if (isSeedance) {
        /* ─── Seedance 2 Fast — multi-reference anchor model ───────────── */
        model = video_model === "seedance-2" ? "bytedance/seedance-2" : "bytedance/seedance-2-fast";

        const VALID_AR = ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "adaptive"];
        input.aspect_ratio = VALID_AR.includes(aspect_ratio) ? aspect_ratio : "1:1";

        // Seedance only takes video resolutions, not image (2K/4K) ones.
        const VALID_RES = ["480p", "720p", "1080p"];
        const seedanceRes = VALID_RES.includes(resolution) ? resolution : "720p";
        // 1080p coerced to 720p for cost (per skill)
        input.resolution = seedanceRes === "1080p" ? "720p" : seedanceRes;

        input.duration = typeof duration === "number" ? duration : 5;
        // Default false for orbit perf; only true if caller explicitly sends true.
        input.generate_audio = generate_audio === true;

        // Mutually-exclusive conditioning modes:
        //   B) keyframes        → first_frame_url + last_frame_url
        //   C) reference_image_urls (+ optional reference_audio_urls)
        const hasKeyframes = !!first_frame_url || !!last_frame_url;
        const audioRefs = Array.isArray(reference_audio_urls)
          ? (reference_audio_urls as string[]).filter(Boolean)
          : [];
        const hasRefs = refImageList.length > 0 || audioRefs.length > 0;

        if (hasKeyframes && hasRefs) {
          return NextResponse.json(
            { error: "Seedance: keyframes and reference_image_urls are mutually exclusive" },
            { status: 400 }
          );
        }
        if (hasKeyframes) {
          if (first_frame_url) input.first_frame_url = first_frame_url;
          if (last_frame_url) input.last_frame_url = last_frame_url;
        } else if (refImageList.length > 0) {
          // Up to 9 anchors; orbit's 4 waypoints all land here.
          input.reference_image_urls = refImageList.slice(0, 9);
        }
        if (audioRefs.length > 0) input.reference_audio_urls = audioRefs;
      } else {
        /* ─── Kling family ─────────────────────────────────────────────── */
        const modelMap: Record<string, { text: string; image: string }> = {
          "kling-2.6": {
            text: "kling-2.6/text-to-video",
            image: "kling-2.6/image-to-video",
          },
          "kling-3.0": {
            text: "kling-3.0/video",
            image: "kling-3.0/video",
          },
          "kling-2.5-turbo": {
            text: "kling-2.5-turbo",
            image: "kling-2.5-turbo",
          },
        };
        const isImageToVideo = refImageList.length > 0;
        const mapped = modelMap[video_model] || modelMap["kling-2.6"];
        model = isImageToVideo ? mapped.image : mapped.text;
        const isKling3 = video_model === "kling-3.0";

        input.aspect_ratio = aspect_ratio || "16:9";
        input.sound = false;
        input.duration = "5";

        // Kling 3.0 single-shot mode caps image_urls at 2 (first + last);
        // older Kling accepts the full list.
        if (refImageList.length > 0) {
          if (isKling3 && refImageList.length > 2) {
            input.image_urls = [refImageList[0], refImageList[refImageList.length - 1]];
          } else {
            input.image_urls = refImageList;
          }
        }
        if (isKling3) {
          input.mode = "std";
          input.multi_shots = false;
          input.multi_prompt = [{ prompt, duration: 5 }];
        }
      }

      payload = { model, input };
    } else if (requestedModel === "gpt-image-2-image-to-image") {
      // GPT-Image-2 image-to-image — uses input_urls (up to 16), quality param
      endpoint = `${KIE_BASE}/jobs/createTask`;
      const input: Record<string, unknown> = {
        prompt: negative_prompt ? `${prompt}. Avoid: ${negative_prompt}` : prompt,
        quality: "high",
      };
      if (input_urls && Array.isArray(input_urls) && input_urls.length > 0) {
        input.input_urls = input_urls.slice(0, 16);
      }
      payload = {
        model: "gpt-image-2-image-to-image",
        input,
      };
    } else {
      // Nano Banana 2 — default image generation
      endpoint = `${KIE_BASE}/jobs/createTask`;
      const input: Record<string, unknown> = {
        prompt: negative_prompt
          ? `${prompt}. Avoid: ${negative_prompt}`
          : prompt,
        aspect_ratio: aspect_ratio || "1:1",
        resolution: resolution || "2K",
        output_format: output_format || "jpg",
      };
      // Add reference images if provided (Nano Banana 2 supports up to 14)
      if (image_input && Array.isArray(image_input) && image_input.length > 0) {
        input.image_input = image_input.slice(0, 14);
      }
      payload = {
        model: "nano-banana-2",
        input,
      };
    }

    console.log(`[kie] Creating ${type} task:`, JSON.stringify(payload).slice(0, 500));
    if (type === "image" && image_input?.length) {
      console.log(`[kie] image_input URLs:`, JSON.stringify(image_input));
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (data.code !== 200) {
      console.error("[kie] Create error:", JSON.stringify(data));
      return NextResponse.json(
        { error: data.msg || `Failed to create task (code ${data.code})` },
        { status: res.status >= 400 ? res.status : 500 }
      );
    }

    const taskId = data.data?.taskId;
    console.log(`[kie] Task created: ${taskId}`);
    return NextResponse.json({ taskId, type });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[kie] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET — poll task status
export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get("taskId");
    const type = req.nextUrl.searchParams.get("type") || "image";

    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    // Both image and video (Kling) use the standard jobs polling endpoint
    const endpoint = `${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`;

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${getKey()}` },
    });

    const data = await res.json();

    if (data.code !== 200) {
      console.error("[kie] Poll error:", JSON.stringify(data));
      return NextResponse.json(
        { error: data.msg || "Failed to get task status" },
        { status: 500 }
      );
    }

    const task = data.data;
    const result: Record<string, unknown> = {
      taskId: task.taskId,
      status: task.state,
      type,
    };

    if (task.state === "success" && task.resultJson) {
      try {
        const parsed =
          typeof task.resultJson === "string"
            ? JSON.parse(task.resultJson)
            : task.resultJson;

        if (type === "video") {
          // Kling video: resultUrls contains video file URLs
          const urls = parsed.resultUrls || parsed.videos;
          if (urls && Array.isArray(urls) && urls.length > 0) {
            result.videos = urls.map((url: string) => ({ url }));
          }
        } else {
          // Image: resultUrls contains image file URLs
          if (parsed.resultUrls && Array.isArray(parsed.resultUrls)) {
            result.images = parsed.resultUrls.map((url: string) => ({ url }));
          }
        }
      } catch {
        console.error("[kie] Failed to parse resultJson:", task.resultJson);
      }
    }

    if (task.state === "fail") {
      result.error = task.failMsg || "Generation failed";
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[kie] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
