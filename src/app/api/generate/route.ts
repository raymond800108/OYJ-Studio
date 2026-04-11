import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { requireAuth } from "@/lib/withAuth";

/**
 * Camera angle generation using fal-ai/qwen-image-edit-2511-multiple-angles.
 *
 * This model auto-constructs <sks> prompts from numeric parameters:
 *   horizontal_angle: 0-360° (0=front, 90=right, 180=back, 270=left)
 *   vertical_angle: -30 to 90° (-30=low angle, 0=eye level, 60=high angle)
 *   zoom: 0-10 (default 5 = medium)
 */
export async function POST(req: NextRequest) {
  // Auth + credit check
  const authResult = await requireAuth("camera-generate");
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
      horizontal_angle,
      vertical_angle,
      zoom,
      prompt,
      lora_scale,
      num_inference_steps,
    } = body;

    if (!image_url) {
      return NextResponse.json(
        { error: "image_url is required" },
        { status: 400 }
      );
    }

    const input: Record<string, unknown> = {
      image_urls: [image_url],
      horizontal_angle: horizontal_angle ?? 0,
      vertical_angle: vertical_angle ?? 0,
      zoom: zoom ?? 5,
      lora_scale: lora_scale ?? 1,
      num_inference_steps: num_inference_steps ?? 28,
      guidance_scale: 4.5,
      enable_safety_checker: false,
      output_format: "png",
    };

    // Additional user prompt (the model auto-generates <sks> from numeric values)
    if (prompt) {
      input.additional_prompt = prompt;
    }

    console.log("[generate] Sending to fal.ai (2511):", JSON.stringify(input, null, 2));

    const result = await fal.subscribe(
      "fal-ai/qwen-image-edit-2511-multiple-angles",
      { input }
    );

    console.log("[generate] Result keys:", Object.keys(result.data as object));
    return NextResponse.json(result.data);
  } catch (error: unknown) {
    const errObj = error as Record<string, unknown>;
    const detail =
      errObj?.body ?? errObj?.message ?? (error instanceof Error ? error.message : "Unknown error");
    console.error("[generate] Error:", JSON.stringify(detail, null, 2));

    let message: string;
    if (typeof detail === "string") {
      message = detail;
    } else {
      const detailStr = JSON.stringify(detail);
      if (detailStr.includes("content_policy_violation")) {
        message = "The image was flagged by the content safety filter. Please try a different image or add a descriptive prompt.";
      } else {
        message = detailStr;
      }
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
