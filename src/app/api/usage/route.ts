import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getSession, getUserProfile } from "@/lib/auth";

/* ─── Upstash Redis ─────────────────────────────────────────────── */

const LEGACY_KEY = "ce:usage:entries";
const USER_KEY_PREFIX = "ce:usage:user:";
const MAX_ENTRIES = 1000;
const SUPER_ADMIN = "raymond800108@gmail.com";
// Always-visible accounts in the admin dropdown (even if they have 0 entries)
const KNOWN_ACCOUNTS = [
  "raymond800108@gmail.com",
  "olivia.sc.yao@gmail.com",
  "oyj.order@gmail.com",
  "oyj.salon@gmail.com",
];

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function emailToKey(email: string): string {
  const safe = email.toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
  return `${USER_KEY_PREFIX}${safe}`;
}

function keyToEmail(key: string): string {
  return key.replace(USER_KEY_PREFIX, "");
}

async function getCurrentUserEmail(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await getUserProfile(session.userId);
  return user?.email?.toLowerCase() ?? null;
}

async function getUserKey(): Promise<string> {
  const email = await getCurrentUserEmail();
  return email ? emailToKey(email) : "ce:usage:anon";
}

async function scanUserKeys(redis: Redis): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis.scan(cursor, {
      match: `${USER_KEY_PREFIX}*`,
      count: 100,
    });
    cursor = String(next);
    keys.push(...(batch as string[]));
  } while (cursor !== "0");
  return keys;
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/* ─── GET: Fetch usage ─────────────────────────────────────────────
 *   ?scope=all             → admin: aggregates all users' entries
 *   ?scope=user&email=xxx  → admin: single user's entries
 *   ?scope=list-users      → admin: list of users with entry counts
 *   (default)              → current user's own entries
 * ───────────────────────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { entries: [], source: "none", message: "Redis not configured" },
      { status: 200 }
    );
  }

  try {
    const scope = req.nextUrl.searchParams.get("scope");
    const emailParam = req.nextUrl.searchParams.get("email")?.toLowerCase();
    const currentEmail = await getCurrentUserEmail();

    if (scope === "list-users") {
      if (currentEmail !== SUPER_ADMIN) {
        return NextResponse.json(
          { users: [], source: "forbidden" },
          { status: 403 }
        );
      }
      const keys = await scanUserKeys(redis);
      const byEmail = new Map<string, number>();
      for (const key of keys) {
        const count = await redis.llen(key);
        byEmail.set(keyToEmail(key), Number(count));
      }
      // Ensure all known accounts appear even if they have 0 entries
      for (const em of KNOWN_ACCOUNTS) {
        if (!byEmail.has(em)) byEmail.set(em, 0);
      }
      const users = Array.from(byEmail.entries()).map(([email, count]) => ({ email, count }));
      users.sort((a, b) => b.count - a.count);
      return NextResponse.json({ users, source: "kv" });
    }

    if (scope === "user") {
      if (currentEmail !== SUPER_ADMIN) {
        return NextResponse.json(
          { entries: [], source: "forbidden" },
          { status: 403 }
        );
      }
      if (!emailParam) {
        return NextResponse.json(
          { entries: [], source: "error", message: "email param required" },
          { status: 400 }
        );
      }
      const key = emailToKey(emailParam);
      const entries = await redis.lrange(key, 0, MAX_ENTRIES - 1);
      return NextResponse.json({ entries: entries || [], source: "kv", key });
    }

    if (scope === "all") {
      if (currentEmail !== SUPER_ADMIN) {
        return NextResponse.json(
          { entries: [], source: "forbidden", message: "Admin access required" },
          { status: 403 }
        );
      }

      const keys = await scanUserKeys(redis);
      const allEntries: string[] = [];
      for (const key of keys) {
        const entries = await redis.lrange(key, 0, MAX_ENTRIES - 1);
        if (entries && entries.length) allEntries.push(...(entries as string[]));
      }

      const parsed = allEntries
        .map((e) => (typeof e === "string" ? safeParse(e) : (e as Record<string, unknown>)))
        .filter((x): x is Record<string, unknown> => x !== null);
      parsed.sort((a, b) => {
        const bt = typeof b.timestamp === "number" ? b.timestamp : 0;
        const at = typeof a.timestamp === "number" ? a.timestamp : 0;
        return bt - at;
      });

      return NextResponse.json({
        entries: parsed.slice(0, MAX_ENTRIES),
        source: "kv",
        scope: "all",
      });
    }

    // Default: current user's own entries
    const key = await getUserKey();
    const entries = await redis.lrange(key, 0, MAX_ENTRIES - 1);
    return NextResponse.json({ entries: entries || [], source: "kv", key });
  } catch (err) {
    console.error("[usage] Redis read error:", err);
    return NextResponse.json({ entries: [], source: "error" }, { status: 200 });
  }
}

/* ─── POST ─────────────────────────────────────────────────────────
 *   ?action=migrate-legacy  → admin: move legacy key entries to a target user
 *                             body: { targetEmail: "olivia.sc.yao@gmail.com" }
 *   (default)               → append one or more entries for current user
 * ───────────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { ok: false, message: "Redis not configured — data saved locally only" },
      { status: 200 }
    );
  }

  try {
    const action = req.nextUrl.searchParams.get("action");

    if (action === "migrate-legacy") {
      const currentEmail = await getCurrentUserEmail();
      if (currentEmail !== SUPER_ADMIN) {
        return NextResponse.json(
          { ok: false, message: "Admin access required" },
          { status: 403 }
        );
      }
      const body = await req.json().catch(() => ({}));
      const targetEmail = (body?.targetEmail as string | undefined)?.toLowerCase();
      if (!targetEmail) {
        return NextResponse.json(
          { ok: false, message: "targetEmail required in body" },
          { status: 400 }
        );
      }

      const targetKey = emailToKey(targetEmail);
      const legacyEntries = await redis.lrange(LEGACY_KEY, 0, MAX_ENTRIES - 1);
      if (!legacyEntries || legacyEntries.length === 0) {
        return NextResponse.json({ ok: true, migrated: 0, message: "Nothing to migrate" });
      }

      let migrated = 0;
      // Preserve order: lrange returns newest first, so to keep order when pushing
      // we iterate from oldest to newest and use lpush (so newest lands at index 0)
      const oldestFirst = [...legacyEntries].reverse();
      for (const raw of oldestFirst) {
        const parsed = typeof raw === "string" ? safeParse(raw) : (raw as Record<string, unknown>);
        if (!parsed) continue;
        const stamped = { ...parsed, userEmail: targetEmail };
        await redis.lpush(targetKey, JSON.stringify(stamped));
        migrated++;
      }
      await redis.ltrim(targetKey, 0, MAX_ENTRIES - 1);
      // Clear the legacy key so we don't double-migrate
      await redis.del(LEGACY_KEY);

      // Optional: reset specific keys requested in body
      const resetEmails = Array.isArray(body?.resetEmails) ? (body.resetEmails as string[]) : [];
      const reset: string[] = [];
      for (const em of resetEmails) {
        const k = emailToKey(em.toLowerCase());
        await redis.del(k);
        reset.push(k);
      }

      return NextResponse.json({ ok: true, migrated, targetKey, reset });
    }

    // Default: append entries for current user
    const key = await getUserKey();
    const email = await getCurrentUserEmail();
    const body = await req.json();
    const entries: Record<string, unknown>[] = Array.isArray(body) ? body : [body];

    for (const entry of entries) {
      const stamped = { ...entry, userEmail: email };
      await redis.lpush(key, JSON.stringify(stamped));
    }

    await redis.ltrim(key, 0, MAX_ENTRIES - 1);

    return NextResponse.json({ ok: true, added: entries.length, key });
  } catch (err) {
    console.error("[usage] Redis write error:", err);
    return NextResponse.json(
      { ok: false, message: "Failed to write to Redis" },
      { status: 500 }
    );
  }
}

/* ─── DELETE ──────────────────────────────────────────────────────
 *   ?scope=all             → admin: clear all users + legacy
 *   ?scope=user&email=xxx  → admin: clear a specific user
 *   (default)              → clear current user's own entries
 * ───────────────────────────────────────────────────────────────── */
export async function DELETE(req: NextRequest) {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ ok: false, message: "Redis not configured" });
  }

  try {
    const scope = req.nextUrl.searchParams.get("scope");
    const emailParam = req.nextUrl.searchParams.get("email")?.toLowerCase();
    const email = await getCurrentUserEmail();

    if (scope === "all") {
      if (email !== SUPER_ADMIN) {
        return NextResponse.json(
          { ok: false, message: "Admin access required" },
          { status: 403 }
        );
      }
      const keys = await scanUserKeys(redis);
      for (const k of keys) await redis.del(k);
      await redis.del(LEGACY_KEY);
      return NextResponse.json({ ok: true, cleared: keys.length });
    }

    if (scope === "user") {
      if (email !== SUPER_ADMIN) {
        return NextResponse.json(
          { ok: false, message: "Admin access required" },
          { status: 403 }
        );
      }
      if (!emailParam) {
        return NextResponse.json(
          { ok: false, message: "email param required" },
          { status: 400 }
        );
      }
      await redis.del(emailToKey(emailParam));
      return NextResponse.json({ ok: true });
    }

    // Default: clear only current user's entries
    const key = await getUserKey();
    await redis.del(key);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[usage] Redis delete error:", err);
    return NextResponse.json(
      { ok: false, message: "Failed to clear Redis" },
      { status: 500 }
    );
  }
}
