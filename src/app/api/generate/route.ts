import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { requireAuth } from "@/lib/withAuth";

/**
 * Build a bilingual (Chinese + English) camera directive prompt from numeric parameters.
 * The dx8152/Multiple-angles LoRA responds to natural language camera instructions.
 *
 * Exact prompt phrases from the LoRA training data:
 *   Rotation:  "将镜头向左旋转45度" / "将镜头向右旋转45度"
 *   Forward:   "将镜头向前移动" / "将镜头转为特写镜头"
 *   Vertical:  "将镜头向下移动" (camera lower → look up) / "将镜头转为俯视" (bird's eye)
 *   Wide:      "将镜头转为广角镜头"
 *
 * vertical_angle semantics (fal.ai):
 *   -1 = bird's eye (camera above, looking down)  → "俯视" / top-down
 *   +1 = worm's eye (camera below, looking up)    → "仰视" / low angle
 */
function buildCameraPrompt(
  rotate: number,
  forward: number,
  vertical: number,
  wideAngle: boolean
): string {
  const parts: string[] = [];

  // Rotation: use exact degree values
  if (rotate !== 0) {
    const absRot = Math.abs(rotate);
    if (rotate > 0) {
      parts.push(`将镜头向右旋转${absRot}度。Rotate the camera ${absRot} degrees to the right.`);
    } else {
      parts.push(`将镜头向左旋转${absRot}度。Rotate the camera ${absRot} degrees to the left.`);
    }
  }

  // Move forward / zoom: convert 0-10 to descriptive text
  if (forward > 0) {
    if (forward >= 7) {
      parts.push(`将镜头转为特写镜头。Turn the camera to a close-up shot.`);
    } else {
      parts.push(`将镜头向前移动。Move the camera forward.`);
    }
  }

  // Vertical angle: convert -1..+1 to degree-based tilt description
  // -1 = bird's eye (90° downward tilt), +1 = worm's eye (90° upward tilt)
  if (vertical !== 0) {
    const tiltDeg = Math.round(Math.abs(vertical) * 90);

    if (vertical <= -0.7) {
      // Strong bird's eye → use exact trained phrase
      parts.push(`将镜头转为俯视。Turn the camera to a top-down bird's eye view looking straight down.`);
    } else if (vertical < 0) {
      // Moderate bird's eye → tilt down by degrees
      parts.push(`将镜头向下倾斜${tiltDeg}度，从上方俯视拍摄。Tilt the camera down ${tiltDeg} degrees to look at the subject from above.`);
    } else if (vertical >= 0.7) {
      // Strong worm's eye → use exact trained phrase
      parts.push(`将镜头向下移动，从低角度仰视拍摄。Move the camera to a low angle, looking up at the subject from below.`);
    } else {
      // Moderate worm's eye → tilt up by degrees
      parts.push(`将镜头向上倾斜${tiltDeg}度，从下方仰视拍摄。Tilt the camera up ${tiltDeg} degrees to look at the subject from a low angle.`);
    }
  }

  // Wide angle
  if (wideAngle) {
    parts.push(`将镜头转为广角镜头。Turn the camera to a wide-angle lens.`);
  }

  if (parts.length === 0) {
    return "";
  }

  return parts.join(" ");
}

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
      rotate_right_left,
      move_forward,
      vertical_angle,
      wide_angle_lens,
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

    const rot = rotate_right_left ?? 0;
    const fwd = move_forward ?? 0;
    const vert = vertical_angle ?? 0;
    const wide = wide_angle_lens ?? false;

    // Build camera directive prompt from numeric values
    const cameraPrompt = buildCameraPrompt(rot, fwd, vert, wide);
    // Combine camera directives + user's optional additional prompt
    const promptParts = [cameraPrompt, prompt].filter(Boolean).join(" ");

    const input: Record<string, unknown> = {
      image_urls: [image_url],
      rotate_right_left: rot,
      move_forward: fwd,
      vertical_angle: vert,
      wide_angle_lens: wide,
      lora_scale: lora_scale ?? 1.5,
      num_inference_steps: num_inference_steps ?? 8,
      guidance_scale: 1,
      enable_safety_checker: false,
    };

    // Only include prompt if we have actual camera directives or user text
    if (promptParts) {
      input.prompt = promptParts;
    }

    console.log("[generate] Sending to fal.ai:", JSON.stringify(input, null, 2));

    const result = await fal.subscribe(
      "fal-ai/qwen-image-edit-2509-lora-gallery/multiple-angles",
      { input }
    );

    console.log("[generate] Result keys:", Object.keys(result.data as object));
    return NextResponse.json(result.data);
  } catch (error: unknown) {
    const errObj = error as Record<string, unknown>;
    const detail =
      errObj?.body ?? errObj?.message ?? (error instanceof Error ? error.message : "Unknown error");
    console.error("[generate] Error:", JSON.stringify(detail, null, 2));

    // Parse content_policy_violation into a user-friendly message
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
