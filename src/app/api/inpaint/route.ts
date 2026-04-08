import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { requireAuth } from "@/lib/withAuth";

export async function POST(req: NextRequest) {
  // Auth + credit check
  const authResult = await requireAuth("inpaint");
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
    const { image_url, mask_url, prompt, strength, num_inference_steps } = body;

    if (!image_url || !mask_url) {
      return NextResponse.json(
        { error: "image_url and mask_url are required" },
        { status: 400 }
      );
    }

    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required for inpainting" },
        { status: 400 }
      );
    }

    const input: Record<string, unknown> = {
      image_url,
      mask_url,
      prompt,
      strength: strength ?? 0.85,
      num_inference_steps: num_inference_steps ?? 28,
      guidance_scale: 3.5,
      num_images: 1,
      output_format: "png",
      enable_safety_checker: true,
    };

    console.log("[inpaint] Sending to fal.ai:", JSON.stringify({
      ...input,
      image_url: input.image_url?.toString().slice(0, 50) + "...",
      mask_url: input.mask_url?.toString().slice(0, 50) + "...",
    }, null, 2));

    const result = await fal.subscribe("fal-ai/flux-lora/inpainting", {
      input: input as Record<string, unknown> & { prompt: string; image_url: string; mask_url: string },
    });

    console.log("[inpaint] Result keys:", Object.keys(result.data as object));
    return NextResponse.json(result.data);
  } catch (error: unknown) {
    const errObj = error as Record<string, unknown>;
    const detail =
      errObj?.body ??
      errObj?.message ??
      (error instanceof Error ? error.message : "Unknown error");
    console.error("[inpaint] Error:", JSON.stringify(detail, null, 2));

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
