import { Redis } from "@upstash/redis";
import { getRedis } from "./redis";
import { listAllUsers } from "./auth";
import type { UserProfile } from "./auth";
import { getCompany } from "./companies";
import type { Company } from "./companies";

/* ─── Types ─────────────────────────────────────────────────────── */

export interface InvoiceLine {
  userId: string;
  userEmail: string | null;
  userName: string;
  calls: number;
  costUsd: number;
}

export interface InvoiceData {
  company: Company;
  users: UserProfile[];
  periodStart: number;
  periodEnd: number;
  periodLabel: string; // e.g. "April 2026"
  lines: InvoiceLine[];
  totalCalls: number;
  totalCostUsd: number;
}

/* ─── Helpers ───────────────────────────────────────────────────── */

const USER_KEY_PREFIX = "ce:usage:user:";
const MAX_ENTRIES = 1000;

function emailToKey(email: string): string {
  const safe = email.toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
  return `${USER_KEY_PREFIX}${safe}`;
}

/** Recover canonical email from a Redis key, handling legacy `__at__`/`_` encoding. */
function keyToEmail(key: string): string {
  const raw = key.replace(USER_KEY_PREFIX, "");
  let email = raw.replace(/__at__/gi, "@").replace(/_dot_/gi, ".");
  const atIdx = email.indexOf("@");
  if (atIdx >= 0) {
    const local = email.slice(0, atIdx);
    const domain = email.slice(atIdx + 1);
    if (!domain.includes(".") && domain.includes("_")) {
      email = `${local}@${domain.replace(/_/g, ".")}`;
    }
  }
  return email.toLowerCase();
}

async function scanAllKeysFor(redis: Redis, email: string): Promise<string[]> {
  const canonical = emailToKey(email);
  const target = email.toLowerCase();
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
  const matching = keys.filter((k) => keyToEmail(k) === target);
  if (!matching.includes(canonical)) matching.push(canonical);
  return matching;
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Get [startOfMonth, startOfNextMonth) timestamps for a given year/month (1-12). */
export function getMonthRange(year: number, month: number): { start: number; end: number; label: string } {
  const start = new Date(year, month - 1, 1).getTime();
  const end = new Date(year, month, 1).getTime();
  const label = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  return { start, end, label };
}

export function getCurrentMonthRange(): { start: number; end: number; label: string } {
  const now = new Date();
  return getMonthRange(now.getFullYear(), now.getMonth() + 1);
}

/** Fetch usage entries for a single user email within a date range,
 *  merging current + legacy Redis keys. */
async function getUserUsageInRange(
  redis: Redis,
  email: string,
  start: number,
  end: number
): Promise<{ calls: number; costUsd: number }> {
  const keys = await scanAllKeysFor(redis, email);
  let calls = 0;
  let costUsd = 0;
  for (const key of keys) {
    const raw = await redis.lrange(key, 0, MAX_ENTRIES - 1);
    if (!raw || raw.length === 0) continue;
    for (const item of raw) {
      const parsed = typeof item === "string" ? safeParse(item) : (item as Record<string, unknown>);
      if (!parsed) continue;
      const ts = typeof parsed.timestamp === "number" ? parsed.timestamp : 0;
      if (ts < start || ts >= end) continue;
      calls += 1;
      costUsd += typeof parsed.costUsd === "number" ? parsed.costUsd : 0;
    }
  }
  return { calls, costUsd };
}

/* ─── Invoice builder ───────────────────────────────────────────── */

export async function buildInvoice(
  companyId: string,
  year: number,
  month: number
): Promise<InvoiceData | null> {
  const redis = getRedis();
  if (!redis) return null;
  const company = await getCompany(companyId);
  if (!company) return null;

  const allUsers = await listAllUsers();
  const companyUsers = allUsers.filter((u) => u.companyId === companyId);
  const { start, end, label } = getMonthRange(year, month);

  const lines: InvoiceLine[] = [];
  let totalCalls = 0;
  let totalCostUsd = 0;

  for (const u of companyUsers) {
    if (!u.email) continue;
    const { calls, costUsd } = await getUserUsageInRange(redis, u.email, start, end);
    lines.push({
      userId: u.id,
      userEmail: u.email,
      userName: u.name,
      calls,
      costUsd,
    });
    totalCalls += calls;
    totalCostUsd += costUsd;
  }

  return {
    company,
    users: companyUsers,
    periodStart: start,
    periodEnd: end,
    periodLabel: label,
    lines,
    totalCalls,
    totalCostUsd,
  };
}

/** Compute this month's accrued cost for a single user (for display). */
export async function getUserMonthCost(
  email: string,
  start?: number,
  end?: number
): Promise<{ calls: number; costUsd: number; periodLabel: string }> {
  const redis = getRedis();
  if (!redis) return { calls: 0, costUsd: 0, periodLabel: "" };
  const range = start && end
    ? { start, end, label: "" }
    : getCurrentMonthRange();
  const { calls, costUsd } = await getUserUsageInRange(redis, email, range.start, range.end);
  return { calls, costUsd, periodLabel: range.label };
}

/** Render a simple HTML invoice body for email. */
export function renderInvoiceHtml(data: InvoiceData): string {
  const rows = data.lines
    .map(
      (l) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(l.userName)}<br/><span style="color:#888;font-size:12px">${escapeHtml(l.userEmail || "")}</span></td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${l.calls}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace">$${l.costUsd.toFixed(2)}</td>
    </tr>`
    )
    .join("");

  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#222;max-width:640px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px;margin-bottom:4px">Invoice — ${escapeHtml(data.periodLabel)}</h1>
  <p style="color:#666;margin-top:0">Billed to: <strong>${escapeHtml(data.company.name)}</strong></p>
  <table style="width:100%;border-collapse:collapse;margin-top:24px">
    <thead>
      <tr style="background:#f8f8f8">
        <th style="padding:8px;text-align:left;border-bottom:2px solid #ddd">User</th>
        <th style="padding:8px;text-align:right;border-bottom:2px solid #ddd">Calls</th>
        <th style="padding:8px;text-align:right;border-bottom:2px solid #ddd">Cost (USD)</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="3" style="padding:16px;text-align:center;color:#888">No usage this period</td></tr>`}</tbody>
    <tfoot>
      <tr>
        <td style="padding:12px 8px;font-weight:bold">Total</td>
        <td style="padding:12px 8px;text-align:right;font-weight:bold">${data.totalCalls}</td>
        <td style="padding:12px 8px;text-align:right;font-weight:bold;font-family:monospace">$${data.totalCostUsd.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
  ${data.company.notes ? `<p style="margin-top:24px;color:#666;font-size:13px">${escapeHtml(data.company.notes)}</p>` : ""}
  <p style="margin-top:32px;color:#aaa;font-size:12px">ContentEngine — costs are estimated based on published API pricing.</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send an invoice via Resend. Returns result metadata.
 * Requires RESEND_API_KEY env var; throws if not configured.
 */
export async function sendInvoiceEmail(data: InvoiceData): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.RESEND_FROM_EMAIL || "invoices@contentengine.app";
  if (!apiKey) {
    return {
      ok: false,
      error: "RESEND_API_KEY not configured. Set it in env to enable email sending.",
    };
  }

  const html = renderInvoiceHtml(data);
  const subject = `Invoice — ${data.company.name} — ${data.periodLabel}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromAddr,
        to: data.company.email,
        subject,
        html,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body?.message || `Resend error (${res.status})` };
    }
    return { ok: true, id: body?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
