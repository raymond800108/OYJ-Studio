import { getRedis } from "@/lib/redis";
import type { DropboxConnection } from "@/app/api/auth/dropbox/callback/route";

const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const RPC_BASE = "https://api.dropboxapi.com/2";

/**
 * Dropbox-API-Arg header MUST be ASCII-only. Any non-ASCII character
 * (Chinese filenames, accented Latin, emoji, …) has to be escaped as
 * \uXXXX or the upstream call fails with 400 — and Vercel's fetch layer
 * usually rejects it outright before it even hits Dropbox.
 */
export function dropboxApiArg(obj: unknown): string {
  return JSON.stringify(obj).replace(/[-￿]/g, (c) =>
    "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
  );
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|tiff|bmp)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;

export async function getValidDropboxToken(userId: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(`dropbox:${userId}`);
  if (!raw) return null;
  const conn: DropboxConnection =
    typeof raw === "string" ? JSON.parse(raw) : (raw as DropboxConnection);

  if (conn.token_expires_at - 60_000 > Date.now()) return conn.access_token;

  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;
  if (!appKey || !appSecret) return null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: conn.refresh_token,
        client_id: appKey,
        client_secret: appSecret,
      }),
    });
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!data.access_token) {
      console.error("[dropbox] refresh failed:", data);
      await redis.del(`dropbox:${userId}`);
      return null;
    }
    const updated: DropboxConnection = {
      ...conn,
      access_token: data.access_token,
      token_expires_at: Date.now() + (data.expires_in ?? 14400) * 1000,
    };
    await redis.set(`dropbox:${userId}`, JSON.stringify(updated));
    return data.access_token;
  } catch (e) {
    console.error("[dropbox] refresh error:", e);
    return null;
  }
}

export interface DropboxFileEntry {
  /** Dropbox file id (id:abc...) */
  id: string;
  /** Filename including extension */
  name: string;
  /** Relative path inside the shared folder, e.g. "/cover.jpg" */
  pathDisplay: string;
  /** Original shared-folder URL — needed to re-resolve the file later */
  sharedUrl: string;
  size: number;
  kind: "image" | "video" | "other";
  /**
   * Direct-download URL via the dl=1 transform. Public, no auth required —
   * suitable for handing to Meta's media-create endpoint when publishing
   * to Instagram (Meta follows the redirect to the actual file bytes).
   */
  directUrl: string;
  /**
   * Same-origin proxy URL backed by /api/dropbox/file. Use this for
   * <img src> / <video src> in our UI — Dropbox's dl=1 returns an HTML
   * download page when fetched cross-origin so it can't be used as a
   * media source directly.
   */
  displayUrl: string;
  /** Public preview URL (web view) for the file inside the shared link */
  webUrl: string;
}

interface ListFolderEntry {
  ".tag": string;
  id: string;
  name: string;
  path_lower?: string;
  path_display?: string;
  size?: number;
}

/**
 * Treat any of these as a Dropbox SHARED-LINK URL (folder or single file):
 *   https://www.dropbox.com/scl/fo/<...>?rlkey=...&dl=0
 *   https://www.dropbox.com/sh/<...>?dl=0
 *   https://www.dropbox.com/scl/fi/<...>?rlkey=...&dl=0   (single file)
 */
export function isDropboxSharedUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?dropbox\.com\/(scl|sh|s)\//.test(url.trim());
}

/**
 * Convert a Dropbox shared-link URL into the direct-download equivalent
 * for a file at relative path `relPath` within that share.
 *
 *   in:  https://www.dropbox.com/sh/abc?dl=0,   /sub/img.jpg
 *   out: https://www.dropbox.com/sh/abc/sub/img.jpg?dl=1&rlkey=...
 */
export function shareLinkPathDirectUrl(
  sharedUrl: string,
  relPath: string
): string {
  // Strip dl param, append the relative path, then set dl=1
  const u = new URL(sharedUrl.trim());
  // Normalise the relative path
  const rp = relPath.startsWith("/") ? relPath : `/${relPath}`;
  // Append rp to the existing pathname (which is the folder root)
  u.pathname = u.pathname.replace(/\/$/, "") + rp;
  u.searchParams.set("dl", "1");
  return u.toString();
}

/**
 * Same as above but generates the in-browser preview (dl=0) URL.
 */
export function shareLinkPathWebUrl(sharedUrl: string, relPath: string): string {
  const u = new URL(sharedUrl.trim());
  const rp = relPath.startsWith("/") ? relPath : `/${relPath}`;
  u.pathname = u.pathname.replace(/\/$/, "") + rp;
  u.searchParams.set("dl", "0");
  return u.toString();
}

/**
 * List the files inside a shared folder URL. Returns image + video files
 * with both a direct-download URL and the in-browser web URL.
 *
 * Uses `/2/files/list_folder` with `shared_link` so the user doesn't
 * need to own the folder — they just need view access via the link.
 *
 * @throws Error with message starting "DROPBOX:" on auth / not-found errors.
 */
export async function listSharedFolderFiles(
  sharedUrl: string,
  accessToken: string
): Promise<DropboxFileEntry[]> {
  const trimmed = sharedUrl.trim();
  if (!isDropboxSharedUrl(trimmed)) {
    throw new Error("DROPBOX:INVALID_URL");
  }

  // Important: when listing a shared link, `path` must be empty string ("") to
  // mean "root of the shared link", NOT "/" (that errors with malformed_path).
  const body = {
    path: "",
    shared_link: { url: trimmed },
    recursive: false,
    include_media_info: false,
    include_deleted: false,
  };

  const res = await fetch(`${RPC_BASE}/files/list_folder`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    if (res.status === 401) throw new Error("DROPBOX:UNAUTHORIZED");
    if (res.status === 409) {
      // 409 covers most "shared_link_not_found" / "path_not_a_folder" cases
      throw new Error(`DROPBOX:NOT_FOUND:${errBody}`);
    }
    throw new Error(`DROPBOX:LIST_FAILED:${res.status}:${errBody}`);
  }

  const data = (await res.json()) as { entries?: ListFolderEntry[] };
  const entries = data.entries ?? [];

  return entries
    .filter((e) => e[".tag"] === "file")
    .map((e): DropboxFileEntry => {
      const relPath = (e.path_display || `/${e.name}`).replace(/^\//, "/");
      const kind: DropboxFileEntry["kind"] = IMAGE_EXT.test(e.name)
        ? "image"
        : VIDEO_EXT.test(e.name)
          ? "video"
          : "other";
      const params = new URLSearchParams({ url: trimmed, path: relPath });
      return {
        id: e.id,
        name: e.name,
        pathDisplay: relPath,
        sharedUrl: trimmed,
        size: e.size ?? 0,
        kind,
        directUrl: shareLinkPathDirectUrl(trimmed, relPath),
        displayUrl: `/api/dropbox/file?${params.toString()}`,
        webUrl: shareLinkPathWebUrl(trimmed, relPath),
      };
    })
    .filter((e) => e.kind === "image" || e.kind === "video");
}

