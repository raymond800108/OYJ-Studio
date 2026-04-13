import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { requireAuth } from "@/lib/withAuth";

/**
 * Relighting using fal-ai/iclight-v2.
 *
 * Changes the lighting direction/style of a product photo while
 * preserving the subject. Supports directional presets (Left, Right,
 * Top, Bottom) and text-prompted lighting descriptions.
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAuth("relight");
  if (authResult.error) return authResult.error;

  try {
    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json(
        { error: "FAL_KEY environment variable is not set" },
        { status: 500 }
      );
    }

    fal.config({ credentials: falKey });

    const body = await req.json();
    const {
      image_url,
      prompt,
      initial_latent = "None",
      guidance_scale = 5,
      num_inference_steps = 28,
      enable_hr_fix = true,
      lowres_denoise = 0.98,
      highres_denoise = 0.95,
      output_format = "png",
    } = body;

    if (!image_url) {
      return NextResponse.json(
        { error: "image_url is required" },
        { status: 400 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required for relighting" },
        { status: 400 }
      );
    }

    const input = {
      image_url,
      prompt,
      initial_latent,
      guidance_scale,
      num_inference_steps,
      enable_hr_fix,
      lowres_denoise,
      highres_denoise,
      output_format,
      num_images: 1,
      enable_safety_checker: false,
    };

    console.log("[relight] Sending to fal.ai iclight-v2:", JSON.stringify({
      ...input,
      image_url: image_url.slice(0, 50) + "...",
    }, null, 2));

    const result = await fal.subscribe("fal-ai/iclight-v2", { input });

    console.log("[relight] Result keys:", Object.keys(result.data as object));
    return NextResponse.json(result.data);
  } catch (error: unknown) {
    const errObj = error as Record<string, unknown>;
    const detail =
      errObj?.body ??
      errObj?.message ??
      (error instanceof Error ? error.message : "Unknown error");
    console.error("[relight] Error:", JSON.stringify(detail, null, 2));

    let message: string;
    if (typeof detail === "string") {
      message = detail;
    } else {
      const detailStr = JSON.stringify(detail);
      if (detailStr.includes("content_policy_violation")) {
        message = "The image was flagged by the content safety filter. Please try a different image or modify your prompt.";
      } else {
        message = detailStr;
      }
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
