import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getValidDropboxToken, dropboxApiArg } from "@/lib/dropbox";

export const maxDuration = 60;

const CONTENT_API = "https://content.dropboxapi.com/2";

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  tiff: "image/tiff",
  bmp: "image/bmp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  webm: "video/webm",
};

function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

/**
 * GET /api/dropbox/file?url=<shared-folder-url>&path=<relative-path>
 *
 * Streams a single file inside a Dropbox shared folder back to the caller
 * using the authenticated user's Dropbox token. Used as the <img src> for
 * the compose page so the browser sees image bytes instead of Dropbox's
 * HTML download page.
 *
 * For Instagram publishing we keep the original dl=1 URL (`directUrl`)
 * because Meta's media-create endpoint needs a publicly reachable URL.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const token = await getValidDropboxToken(session.userId);
  if (!token) return new NextResponse("Dropbox not connected", { status: 401 });

  const sharedUrl = req.nextUrl.searchParams.get("url");
  const path = req.nextUrl.searchParams.get("path");
  if (!sharedUrl || !path) {
    return new NextResponse("Missing url or path", { status: 400 });
  }

  const dropboxRes = await fetch(`${CONTENT_API}/sharing/get_shared_link_file`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      // Dropbox-API-Arg requires ASCII; non-ASCII filenames (e.g. Chinese)
      // need \uXXXX escapes or the request fails before reaching Dropbox.
      "Dropbox-API-Arg": dropboxApiArg({ url: sharedUrl, path }),
    },
  });

  if (!dropboxRes.ok) {
    const body = await dropboxRes.text();
    console.error("[dropbox/file] fetch failed", dropboxRes.status, body);
    return new NextResponse(body || "Dropbox fetch failed", {
      status: dropboxRes.status,
    });
  }

  const filename = path.split("/").pop() || "file";
  const mime = guessMime(filename);

  // Read the whole body into an ArrayBuffer before returning. Next.js 16
  // on the Vercel Node runtime rejects passing a raw fetch ReadableStream
  // straight into NextResponse with "TypeError: Cannot convert argument
  // to a TypedArray", so we materialise the bytes here. Image thumbnails
  // are small enough that buffering is fine.
  const buf = await dropboxRes.arrayBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
