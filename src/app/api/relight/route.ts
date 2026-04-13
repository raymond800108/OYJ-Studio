import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { requireAuth } from "@/lib/withAuth";

/**
 * Relighting using fal-ai/image-apps-v2/relighting.
 *
 * Applies a lighting style preset to the image while preserving
 * the background and scene composition natively — no compositing needed.
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
    const { image_url, lighting_style = "natural" } = body;

    if (!image_url) {
      return NextResponse.json(
        { error: "image_url is required" },
        { status: 400 }
      );
    }

    const input = {
      image_url,
      lighting_style,
    };

    console.log("[relight] Sending to fal.ai image-apps-v2/relighting:", JSON.stringify(input));

    const result = await fal.subscribe("fal-ai/image-apps-v2/relighting", { input });

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
