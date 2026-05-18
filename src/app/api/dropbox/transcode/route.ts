import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { getValidDropboxToken } from "@/lib/dropbox";

// Re-encoding large images can take time. Vercel default 60s is fine.
export const maxDuration = 60;

const CONTENT_API = "https://content.dropboxapi.com/2";

/**
 * POST /api/dropbox/transcode
 * Body: { sharedUrl: string, path: string, kind: "image" | "video", filename: string }
 *
 * Pipeline:
 *   1. Fetch the Dropbox file bytes via sharing/get_shared_link_file
 *      (works for any file inside a shared folder the user can view).
 *   2. For images — re-encode to JPEG via sharp at 90% quality, max
 *      2048px on the long edge. Removes alpha, strips metadata, and
 *      flattens onto white so PNG → JPEG conversion looks correct.
 *   3. For videos — upload original bytes (Instagram supports mp4/mov).
 *   4. Upload to fal.ai storage, return the resulting public URL.
 *
 * Meta's media-create endpoint accepts that fal URL directly and
 * publishes successfully — fixes "The image format is not supported."
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getValidDropboxToken(session.userId);
  if (!token) {
    return NextResponse.json({ error: "DROPBOX_NOT_CONNECTED" }, { status: 401 });
  }

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return NextResponse.json({ error: "FAL_KEY not configured" }, { status: 500 });
  }
  fal.config({ credentials: falKey });

  const body = (await req.json()) as {
    sharedUrl?: string;
    path?: string;
    kind?: "image" | "video";
    filename?: string;
  };
  const sharedUrl = body.sharedUrl;
  const path = body.path;
  const kind = body.kind ?? "image";
  const filename = body.filename ?? "file";

  if (!sharedUrl || !path) {
    return NextResponse.json({ error: "sharedUrl and path required" }, { status: 400 });
  }

  // Step 1 — fetch original bytes from Dropbox
  const dbRes = await fetch(`${CONTENT_API}/sharing/get_shared_link_file`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": JSON.stringify({ url: sharedUrl, path }),
    },
  });
  if (!dbRes.ok) {
    const text = await dbRes.text();
    console.error("[transcode] dropbox fetch failed:", dbRes.status, text);
    if (dbRes.status === 401) {
      return NextResponse.json({ error: "DROPBOX_NOT_CONNECTED" }, { status: 401 });
    }
    return NextResponse.json(
      { error: `Dropbox fetch failed: ${dbRes.status}` },
      { status: 502 }
    );
  }
  const original = Buffer.from(await dbRes.arrayBuffer());

  let outBuffer: Buffer;
  let outName: string;
  let outType: string;

  try {
    if (kind === "image") {
      // Re-encode to JPEG so Meta accepts it regardless of source
      // (PNG/HEIC/TIFF all rejected by IG media-create otherwise).
      outBuffer = await sharp(original)
        .rotate() // honor EXIF orientation
        .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" }) // drop alpha → solid white bg
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
      outName = filename.replace(/\.[^.]+$/, "") + ".jpg";
      outType = "image/jpeg";
    } else {
      // Pass video through unchanged. IG accepts mp4/mov for Reels.
      outBuffer = original;
      outName = filename;
      outType = filename.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4";
    }
  } catch (e) {
    console.error("[transcode] re-encode failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "transcode failed" },
      { status: 500 }
    );
  }

  // Step 2 — upload to fal.ai storage (public URL, no auth needed by Meta)
  let publicUrl: string;
  try {
    // Convert Buffer → Blob for fal.storage.upload
    const blob = new Blob([new Uint8Array(outBuffer)], { type: outType });
    const file = new File([blob], outName, { type: outType });
    publicUrl = await fal.storage.upload(file);
  } catch (e) {
    console.error("[transcode] fal upload failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "upload failed" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    url: publicUrl,
    contentType: outType,
    bytes: outBuffer.length,
  });
}
