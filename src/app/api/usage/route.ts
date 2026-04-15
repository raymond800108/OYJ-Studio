import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getSession, getUserProfile } from "@/lib/auth";

/* ─── Upstash Redis ─────────────────────────────────────────────── */

const LEGACY_KEY = "ce:usage:entries";
const USER_KEY_PREFIX = "ce:usage:user:";
/** Hard safety cap to prevent a single user from blowing up Redis.
 *  Entries are otherwise kept indefinitely until the admin sends an
 *  invoice for the billing period. */
const SAFETY_CAP = 10000;
/** Max entries returned by list endpoints — separate from storage cap. */
const MAX_ENTRIES = 2000;
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

/**
 * Recover a canonical email address from a Redis key, handling both:
 *   - current format: "ce:usage:user:foo@bar.com"
 *   - legacy format:  "ce:usage:user:foo__at__bar_com" (or similar _dot_ variants)
 */
function keyToEmail(key: string): string {
  const raw = key.replace(USER_KEY_PREFIX, "");
  // Legacy: `__at__` → `@`
  let email = raw.replace(/__at__/gi, "@");
  // Legacy: `_dot_` → `.`
  email = email.replace(/_dot_/gi, ".");
  // If it contains `@`, the domain portion is the part after @ —
  // legacy keys typically encoded `.` as `_` in the domain.
  const atIdx = email.indexOf("@");
  if (atIdx >= 0) {
    const local = email.slice(0, atIdx);
    const domain = email.slice(atIdx + 1);
    // Only rewrite domain `_` → `.` if there's no explicit `.` already
    // (safe because real email domains cannot contain underscores).
    if (!domain.includes(".") && domain.includes("_")) {
      email = `${local}@${domain.replace(/_/g, ".")}`;
    }
  }
  return email.toLowerCase();
}

/**
 * Map storage keys to their canonical email, grouping duplicates
 * (e.g. a legacy `foo__at__gmail_com` key plus a current `foo@gmail.com` key
 * both resolve to `foo@gmail.com`).
 */
function groupKeysByEmail(keys: string[]): Map<string, string[]> {
  const byEmail = new Map<string, string[]>();
  for (const k of keys) {
    const email = keyToEmail(k);
    const list = byEmail.get(email) || [];
    list.push(k);
    byEmail.set(email, list);
  }
  return byEmail;
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
      const grouped = groupKeysByEmail(keys);
      const byEmail = new Map<string, number>();
      for (const [email, keyGroup] of grouped.entries()) {
        let total = 0;
        for (const k of keyGroup) {
          total += Number(await redis.llen(k));
        }
        byEmail.set(email, total);
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
      // Read from any stored key that resolves to this email (current + legacy)
      const allKeys = await scanUserKeys(redis);
      const matching = allKeys.filter((k) => keyToEmail(k) === emailParam);
      // Always include the canonical key even if currently empty
      const canonical = emailToKey(emailParam);
      if (!matching.includes(canonical)) matching.push(canonical);

      const merged: string[] = [];
      for (const k of matching) {
        const rows = await redis.lrange(k, 0, MAX_ENTRIES - 1);
        if (rows && rows.length) merged.push(...(rows as string[]));
      }
      // Sort newest first by timestamp
      const parsed = merged
        .map((e) => (typeof e === "string" ? safeParse(e) : (e as Record<string, unknown>)))
        .filter((x): x is Record<string, unknown> => x !== null);
      parsed.sort((a, b) => {
        const bt = typeof b.timestamp === "number" ? b.timestamp : 0;
        const at = typeof a.timestamp === "number" ? a.timestamp : 0;
        return bt - at;
      });

      return NextResponse.json({
        entries: parsed.slice(0, MAX_ENTRIES).map((p) => JSON.stringify(p)),
        source: "kv",
        key: canonical,
      });
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
      await redis.ltrim(targetKey, 0, SAFETY_CAP - 1);
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

    // Only trim at the safety cap — entries are otherwise retained
    // until admin sends an invoice for the billing period.
    await redis.ltrim(key, 0, SAFETY_CAP - 1);

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
      // Delete both the canonical key and any legacy keys that resolve to
      // this email.
      const allKeys = await scanUserKeys(redis);
      const matching = allKeys.filter((k) => keyToEmail(k) === emailParam);
      const canonical = emailToKey(emailParam);
      if (!matching.includes(canonical)) matching.push(canonical);
      for (const k of matching) await redis.del(k);
      return NextResponse.json({ ok: true, cleared: matching.length });
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
