import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { requireAuth } from "@/lib/withAuth";

/**
 * Relighting using fal-ai/iclight-v2 + background preservation.
 *
 * IC-Light V2 regenerates the entire scene including background.
 * To preserve the original background we:
 *   1. Extract a foreground mask via fal-ai/birefnet (parallel)
 *   2. Relight the full image via fal-ai/iclight-v2 (parallel)
 *   3. Composite: original background + relit foreground using the mask
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

    const relightInput = {
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

    console.log("[relight] Starting parallel relight + mask extraction");

    // Run relighting and foreground mask extraction in parallel
    const [relightResult, maskResult] = await Promise.all([
      fal.subscribe("fal-ai/iclight-v2", { input: relightInput }),
      fal.subscribe("fal-ai/birefnet", {
        input: {
          image_url,
          model: "General Use (Heavy)",
          operating_resolution: "1024x1024",
          output_format: "png",
        },
      }),
    ]);

    const relightData = relightResult.data as { images?: { url: string }[] };
    const maskData = maskResult.data as { image?: { url: string } };

    const relitUrl = relightData.images?.[0]?.url;
    const maskUrl = maskData.image?.url;

    if (!relitUrl) throw new Error("No image in relight response");
    if (!maskUrl) throw new Error("No mask from birefnet");

    console.log("[relight] Compositing: original bg + relit foreground");

    // Fetch all three images in parallel
    const [originalBuf, relitBuf, maskBuf] = await Promise.all([
      fetch(image_url).then((r) => r.arrayBuffer()).then(Buffer.from),
      fetch(relitUrl).then((r) => r.arrayBuffer()).then(Buffer.from),
      fetch(maskUrl).then((r) => r.arrayBuffer()).then(Buffer.from),
    ]);

    // Get dimensions from the relit image (IC-Light may resize)
    const relitMeta = await sharp(relitBuf).metadata();
    const w = relitMeta.width!;
    const h = relitMeta.height!;

    // Resize original and mask to match relit dimensions
    const originalResized = await sharp(originalBuf)
      .resize(w, h, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer();

    const relitRaw = await sharp(relitBuf)
      .resize(w, h, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer();

    // birefnet returns an image with transparent background — extract alpha as mask
    const maskResized = await sharp(maskBuf)
      .resize(w, h, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer();

    // Composite pixel by pixel: result = original * (1 - alpha) + relit * alpha
    const pixelCount = w * h;
    const result = Buffer.alloc(pixelCount * 4);

    for (let i = 0; i < pixelCount; i++) {
      const off = i * 4;
      // Use the alpha channel from birefnet mask as the blend factor
      const alpha = maskResized[off + 3] / 255;

      result[off] = Math.round(originalResized[off] * (1 - alpha) + relitRaw[off] * alpha);
      result[off + 1] = Math.round(originalResized[off + 1] * (1 - alpha) + relitRaw[off + 1] * alpha);
      result[off + 2] = Math.round(originalResized[off + 2] * (1 - alpha) + relitRaw[off + 2] * alpha);
      result[off + 3] = 255;
    }

    // Encode the composited result as PNG
    const compositedPng = await sharp(result, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toBuffer();

    // Upload composited result to fal storage
    const blob = new Blob([compositedPng as unknown as ArrayBuffer], { type: "image/png" });
    const file = new File([blob], "relit-composited.png", { type: "image/png" });
    const uploadedUrl = await fal.storage.upload(file);

    console.log("[relight] Composited result uploaded:", uploadedUrl.slice(0, 60));

    return NextResponse.json({
      images: [{ url: uploadedUrl }],
    });
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
