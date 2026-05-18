import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { getSession } from "@/lib/auth";
import { getValidDropboxToken } from "@/lib/dropbox";

// Re-encoding video can take a minute or two; image re-encode is fast.
export const maxDuration = 300;

const CONTENT_API = "https://content.dropboxapi.com/2";

/**
 * Re-encode an arbitrary video buffer into IG-compatible specs:
 *   - codec: libx264 (H.264) + AAC audio
 *   - resolution: scaled to fit 1080x1350 (4:5 portrait), padded with
 *     white when source aspect doesn't match
 *   - duration: capped at 60s (carousel-video cap)
 *   - faststart so Meta can start streaming before full download
 *
 * Uses the ffmpeg binary bundled by `ffmpeg-static`. Runs via spawn so we
 * stream stdout/stderr without buffering the entire ffmpeg log in memory.
 */
async function transcodeVideoForIg(input: Buffer): Promise<Buffer> {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static binary not bundled");
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "ig-transcode-"));
  const inPath = path.join(workDir, "in.mp4");
  const outPath = path.join(workDir, "out.mp4");

  try {
    await writeFile(inPath, input);

    // 4:5 portrait, 1080x1350 — the safest aspect that works for single-
    // Reels (which allows 4:5) AND carousel videos (which require 1.91:1
    // to 4:5). scale=…:force_original_aspect_ratio=decrease then pad
    // letterboxes the source onto a white 1080x1350 canvas.
    const filter =
      "scale=1080:1350:force_original_aspect_ratio=decrease," +
      "pad=1080:1350:(ow-iw)/2:(oh-ih)/2:white";

    const args = [
      "-y",
      "-i", inPath,
      "-t", "60",
      "-vf", filter,
      "-r", "30",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-pix_fmt", "yuv420p",
      "-profile:v", "high",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath as string, args);
      let stderr = "";
      proc.stderr.on("data", (d) => {
        // ffmpeg writes progress + errors here. Keep only the tail for log.
        stderr += d.toString();
        if (stderr.length > 4000) stderr = stderr.slice(-4000);
      });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          console.error("[ffmpeg] failed:", stderr);
          reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
        }
      });
    });

    return await readFile(outPath);
  } finally {
    // Always clean up /tmp so we don't accumulate across invocations
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

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
      // Re-encode video to IG-compatible spec.
      //
      // IG carousel videos need H.264/AAC, aspect ratio between 1.91:1 and 4:5
      // (NO 9:16 portrait), max 60s. We pad/scale to 1080x1350 (4:5 portrait)
      // which is the largest IG feed dimension and works for BOTH single-
      // Reel and carousel-video paths. Phone-camera HEVC/H.265 MOV files are
      // re-encoded to H.264 here so Meta accepts them.
      outBuffer = await transcodeVideoForIg(original);
      outName = filename.replace(/\.[^.]+$/, "") + ".mp4";
      outType = "video/mp4";
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
