import { NextRequest, NextResponse } from "next/server";

const BLOTATO_BASE = "https://backend.blotato.com/v2";

export async function GET(req: NextRequest) {
  const apiKey =
    req.headers.get("x-blotato-key") || process.env.BLOTATO_API_KEY || null;
  if (!apiKey)
    return NextResponse.json({ error: "No Blotato API key" }, { status: 401 });

  const res = await fetch(`${BLOTATO_BASE}/users/me/accounts`, {
    headers: {
      "blotato-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  if (!res.ok)
    return NextResponse.json(
      { error: data.message || "Failed" },
      { status: res.status }
    );

  return NextResponse.json(data);
}
