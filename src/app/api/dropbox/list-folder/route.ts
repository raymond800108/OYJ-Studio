import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getValidDropboxToken, listSharedFolderFiles } from "@/lib/dropbox";

/**
 * POST /api/dropbox/list-folder
 * Body: { sharedUrl: string }
 *
 * Returns the image + video files inside the given Dropbox shared folder URL.
 * Each entry carries `directUrl` suitable for handing to Instagram media
 * publish or any <img src=...> tag.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getValidDropboxToken(session.userId);
  if (!token) {
    return NextResponse.json({ error: "DROPBOX_NOT_CONNECTED" }, { status: 401 });
  }

  const { sharedUrl } = (await req.json()) as { sharedUrl?: string };
  if (!sharedUrl || typeof sharedUrl !== "string") {
    return NextResponse.json({ error: "sharedUrl required" }, { status: 400 });
  }

  try {
    const files = await listSharedFolderFiles(sharedUrl, token);
    return NextResponse.json({ files });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.startsWith("DROPBOX:INVALID_URL")) {
      return NextResponse.json({ error: "INVALID_URL" }, { status: 400 });
    }
    if (msg.startsWith("DROPBOX:UNAUTHORIZED")) {
      return NextResponse.json({ error: "DROPBOX_NOT_CONNECTED" }, { status: 401 });
    }
    if (msg.startsWith("DROPBOX:NOT_FOUND")) {
      return NextResponse.json({ error: "FOLDER_NOT_FOUND" }, { status: 404 });
    }
    console.error("[dropbox/list-folder]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
