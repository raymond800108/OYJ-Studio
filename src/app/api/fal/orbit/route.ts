import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { requireAuth } from "@/lib/withAuth";

const MODEL_ID = "fal-ai/qwen-image-edit-2511-multiple-angles";

function configureFal() {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY environment variable is not set");
  fal.config({ credentials: key });
}

function extractFalErrorDetail(err: Record<string, unknown> | undefined): string | null {
  if (!err) return null;
  const body = err.body as { detail?: unknown } | undefined;
  if (!body) return typeof err.message === "string" ? err.message : null;
  const detail = body.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const lines = (detail as { msg?: string; type?: string }[])
      .map((d) => {
        const msg = (d.msg || "").trim();
        const type = (d.type || "").trim();
        return msg ? (type ? `[${type}] ${msg}` : msg) : null;
      })
      .filter(Boolean);
    if (lines.length > 0) return lines.join("; ");
  }
  return typeof err.message === "string" ? err.message : null;
}

function extractErrorMessage(obj: Record<string, unknown> | null | undefined): string | null {
  if (!obj) return null;
  const candidates = [
    (obj as { error?: string }).error,
    (obj as { error?: { message?: string } }).error?.message,
    (obj as { detail?: string }).detail,
    (obj as { message?: string }).message,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c;
  }
  return null;
}

// POST — submit an orbit job (single still at a given camera angle)
export async function POST(req: NextRequest) {
  const auth = await requireAuth("camera-generate");
  if (auth.error) return auth.error;

  try {
    configureFal();
    const body = await req.json();
    const {
      image_url,
      horizontal_angle,
      vertical_angle,
      zoom,
      output_format = "png",
      num_images = 1,
    } = body;

    if (!image_url) {
      return NextResponse.json({ error: "image_url is required" }, { status: 400 });
    }
    if (typeof horizontal_angle !== "number" ||
        typeof vertical_angle !== "number" ||
        typeof zoom !== "number") {
      return NextResponse.json({ error: "horizontal_angle, vertical_angle, zoom must be numbers" }, { status: 400 });
    }

    const input = {
      image_urls: [image_url],
      horizontal_angle,
      vertical_angle,
      zoom,
      output_format,
      num_images,
    };

    const { request_id } = await fal.queue.submit(MODEL_ID, { input });
    return NextResponse.json({ request_id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET — poll an orbit job by request_id
export async function GET(req: NextRequest) {
  try {
    configureFal();
    const request_id = req.nextUrl.searchParams.get("request_id");
    if (!request_id) {
      return NextResponse.json({ error: "request_id required" }, { status: 400 });
    }

    const status = await fal.queue.status(MODEL_ID, { requestId: request_id });
    const raw = (status as { status?: string }).status || "";
    const normalized =
      raw === "COMPLETED" ? "success"
      : raw === "FAILED" || raw === "ERROR" || raw === "CANCELLED" ? "fail"
      : raw === "IN_PROGRESS" ? "processing"
      : "pending";

    if (normalized === "success" || normalized === "fail") {
      type FalError = Error & {
        status?: number;
        body?: { detail?: { msg?: string; type?: string }[] | string };
      };

      let resultAny: Record<string, unknown>;
      try {
        const result = await fal.queue.result(MODEL_ID, { requestId: request_id });
        resultAny = result as Record<string, unknown>;
      } catch (e) {
        const fe = e as FalError;
        resultAny = { _falError: { message: fe.message, status: fe.status, body: fe.body } };
      }

      const dataAny = (resultAny.data ?? resultAny) as Record<string, unknown>;
      const images = (dataAny.images as { url?: string }[] | undefined) || [];

      const explicitError =
        extractFalErrorDetail(resultAny._falError as Record<string, unknown> | undefined) ||
        extractErrorMessage(resultAny) ||
        extractErrorMessage(dataAny);

      if (images.length === 0 || normalized === "fail") {
        return NextResponse.json({
          status: "fail",
          error: explicitError || "Generation failed. Try a different image or angle.",
          request_id,
        });
      }
      return NextResponse.json({ status: "success", images });
    }

    return NextResponse.json({ status: normalized });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
