// One-shot migration:
//   1. Move all entries from legacy `ce:usage:entries` → olivia.sc.yao@gmail.com
//   2. Reset raymond800108@gmail.com and oyj.order@gmail.com keys to zero
//
// Run: node --env-file=.env.local scripts/migrate-usage.mjs

import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error("Missing KV_REST_API_URL or KV_REST_API_TOKEN");
  process.exit(1);
}

const redis = new Redis({ url, token });

const LEGACY_KEY = "ce:usage:entries";
const USER_KEY_PREFIX = "ce:usage:user:";
const TARGET_EMAIL = "olivia.sc.yao@gmail.com";
const RESET_EMAILS = ["raymond800108@gmail.com", "oyj.order@gmail.com"];

function emailToKey(email) {
  const safe = email.toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
  return `${USER_KEY_PREFIX}${safe}`;
}

function safeParse(s) {
  try {
    return typeof s === "string" ? JSON.parse(s) : s;
  } catch {
    return null;
  }
}

async function main() {
  console.log("── Migration start ──");

  // 1. Read legacy entries
  const legacy = await redis.lrange(LEGACY_KEY, 0, 999);
  console.log(`Legacy entries found: ${legacy?.length ?? 0}`);

  const targetKey = emailToKey(TARGET_EMAIL);
  console.log(`Target key: ${targetKey}`);

  // 2. Check current state of target
  const existingTarget = await redis.llen(targetKey);
  console.log(`Existing entries at target: ${existingTarget}`);

  // 3. Push legacy entries to target, stamped with userEmail
  let migrated = 0;
  if (legacy && legacy.length > 0) {
    const oldestFirst = [...legacy].reverse();
    for (const raw of oldestFirst) {
      const parsed = safeParse(raw);
      if (!parsed) continue;
      const stamped = { ...parsed, userEmail: TARGET_EMAIL };
      await redis.lpush(targetKey, JSON.stringify(stamped));
      migrated++;
    }
    await redis.ltrim(targetKey, 0, 999);
  }
  console.log(`Migrated ${migrated} entries to ${TARGET_EMAIL}`);

  // 4. Delete legacy key
  await redis.del(LEGACY_KEY);
  console.log(`Deleted legacy key: ${LEGACY_KEY}`);

  // 5. Reset raymond and oyj.order
  for (const email of RESET_EMAILS) {
    const key = emailToKey(email);
    const before = await redis.llen(key);
    await redis.del(key);
    console.log(`Reset ${email} (${before} → 0)`);
  }

  // 6. Verify
  const finalTarget = await redis.llen(targetKey);
  console.log(`\nFinal state: ${TARGET_EMAIL} has ${finalTarget} entries`);

  console.log("── Migration complete ──");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
