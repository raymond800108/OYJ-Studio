import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

/* ─── Upstash Redis ─────────────────────────────────────────────── */

const KV_KEY = "ce:usage:entries";
const MAX_ENTRIES = 1000;

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/* ─── GET: Fetch all usage entries ──────────────────────────────── */
export async function GET() {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { entries: [], source: "none", message: "Redis not configured" },
      { status: 200 }
    );
  }

  try {
    const entries = await redis.lrange(KV_KEY, 0, MAX_ENTRIES - 1);
    return NextResponse.json({ entries: entries || [], source: "kv" });
  } catch (err) {
    console.error("[usage] Redis read error:", err);
    return NextResponse.json({ entries: [], source: "error" }, { status: 200 });
  }
}

/* ─── POST: Add one or more usage entries ───────────────────────── */
export async function POST(req: NextRequest) {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { ok: false, message: "Redis not configured — data saved locally only" },
      { status: 200 }
    );
  }

  try {
    const body = await req.json();
    const entries: unknown[] = Array.isArray(body) ? body : [body];

    // Push each entry to the front of the list (newest first)
    for (const entry of entries) {
      await redis.lpush(KV_KEY, JSON.stringify(entry));
    }

    // Trim to keep only the last MAX_ENTRIES
    await redis.ltrim(KV_KEY, 0, MAX_ENTRIES - 1);

    return NextResponse.json({ ok: true, added: entries.length });
  } catch (err) {
    console.error("[usage] Redis write error:", err);
    return NextResponse.json(
      { ok: false, message: "Failed to write to Redis" },
      { status: 500 }
    );
  }
}

/* ─── DELETE: Clear all usage entries ───────────────────────────── */
export async function DELETE() {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ ok: false, message: "Redis not configured" });
  }

  try {
    await redis.del(KV_KEY);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[usage] Redis delete error:", err);
    return NextResponse.json(
      { ok: false, message: "Failed to clear Redis" },
      { status: 500 }
    );
  }
}
