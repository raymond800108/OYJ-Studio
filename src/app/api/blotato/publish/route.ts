import { NextRequest, NextResponse } from "next/server";

const BLOTATO_BASE = "https://backend.blotato.com/v2";

// POST — publish or schedule a post via Blotato
export async function POST(req: NextRequest) {
  const apiKey =
    req.headers.get("x-blotato-key") || process.env.BLOTATO_API_KEY || null;
  if (!apiKey)
    return NextResponse.json({ error: "No Blotato API key" }, { status: 401 });

  const body = await req.json();
  const { accountId, text, mediaUrls, platform, scheduledTime } = body as {
    accountId: string;
    text: string;
    mediaUrls: string[];
    platform: string;
    scheduledTime?: number;
  };

  if (!accountId || !platform) {
    return NextResponse.json(
      { error: "accountId and platform are required" },
      { status: 400 }
    );
  }

  // accountId MUST be an integer for Blotato
  const numericAccountId = parseInt(accountId, 10);
  if (isNaN(numericAccountId)) {
    return NextResponse.json(
      { error: "accountId must be numeric" },
      { status: 400 }
    );
  }

  // Use provided scheduledTime or schedule 15 seconds from now
  const resolvedScheduledTime = scheduledTime ?? Date.now() + 15_000;

  const payload = {
    post: {
      accountId: numericAccountId,
      content: {
        text: text || "",
        mediaUrls: mediaUrls || [],
        platform,
      },
    },
    scheduledTime: resolvedScheduledTime,
  };

  const res = await fetch(`${BLOTATO_BASE}/posts`, {
    method: "POST",
    headers: {
      "blotato-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok)
    return NextResponse.json(
      { error: data.message || "Failed to publish" },
      { status: res.status }
    );

  return NextResponse.json(data);
}

// GET — poll status by ?id=postSubmissionId
export async function GET(req: NextRequest) {
  const apiKey =
    req.headers.get("x-blotato-key") || process.env.BLOTATO_API_KEY || null;
  if (!apiKey)
    return NextResponse.json({ error: "No Blotato API key" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  const res = await fetch(`${BLOTATO_BASE}/posts/${id}`, {
    headers: {
      "blotato-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  if (!res.ok)
    return NextResponse.json(
      { error: data.message || "Failed to fetch post status" },
      { status: res.status }
    );

  return NextResponse.json(data);
}
