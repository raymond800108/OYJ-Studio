import { Redis } from "@upstash/redis";
import { getRedis } from "./redis";
import { listAllUsers } from "./auth";
import type { UserProfile } from "./auth";
import { getCompany } from "./companies";
import type { Company } from "./companies";
import { BUSINESS, BANK, INVOICE_DEFAULTS } from "./business";

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
  /** Sequential invoice number, e.g. "INV-2026-04-001" — set at send time */
  invoiceNumber?: string;
  /** Issue date (ms since epoch) — defaults to now */
  issueDate?: number;
  /** Due date (ms since epoch) — defaults to issueDate + 14 days */
  dueDate?: number;
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

/**
 * Delete entries within a [start, end) timestamp range for a user,
 * across current + legacy Redis keys. Called after invoice is sent
 * so the billing period is "closed out".
 * Returns the number of entries removed.
 */
export async function purgeUserUsageInRange(
  email: string,
  start: number,
  end: number
): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  const keys = await scanAllKeysFor(redis, email);
  let removed = 0;
  for (const key of keys) {
    const raw = await redis.lrange(key, 0, -1);
    if (!raw || raw.length === 0) continue;
    // Keep only entries outside the [start, end) window
    const kept: string[] = [];
    for (const item of raw) {
      const s = typeof item === "string" ? item : JSON.stringify(item);
      const parsed = typeof item === "string" ? safeParse(item) : (item as Record<string, unknown>);
      const ts = parsed && typeof parsed.timestamp === "number" ? parsed.timestamp : 0;
      if (ts >= start && ts < end) {
        removed++;
      } else {
        kept.push(s);
      }
    }
    // Rewrite the list atomically
    await redis.del(key);
    if (kept.length > 0) {
      // kept is currently in "newest first" order; lpush reverses order,
      // so push oldest first to preserve chronology.
      for (const s of [...kept].reverse()) {
        await redis.lpush(key, s);
      }
    }
  }
  return removed;
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

/* ─── Date helpers ──────────────────────────────────────────────── */

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }); // "16 Apr 2026"
}

function ensureDates(data: InvoiceData): {
  invoiceNumber: string;
  issueTs: number;
  dueTs: number;
} {
  const issueTs = data.issueDate ?? Date.now();
  const dueTs = data.dueDate ?? issueTs + INVOICE_DEFAULTS.netDays * 86400000;
  const invoiceNumber = data.invoiceNumber ?? "INV-PREVIEW";
  return { invoiceNumber, issueTs, dueTs };
}

/** Render a polished, professional HTML invoice for email + preview. */
export function renderInvoiceHtml(data: InvoiceData): string {
  const { invoiceNumber, issueTs, dueTs } = ensureDates(data);
  const { brand } = BUSINESS;

  // USD amount formatter
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const fmtUsd = (n: number) =>
    `${fmt(n)} <span style="color:${brand.muted};font-size:10px;font-weight:400;letter-spacing:0.5px">USD</span>`;

  const lineRows = data.lines
    .map(
      (l, i) => `
    <tr style="background:${i % 2 === 0 ? "#fff" : brand.softBg}">
      <td style="padding:12px 16px;border-bottom:1px solid ${brand.border};font-size:13px;color:${brand.text}">
        <div style="font-weight:500">${escapeHtml(l.userName)}</div>
        <div style="color:${brand.muted};font-size:11px;margin-top:2px;font-family:'SF Mono',Menlo,monospace">${escapeHtml(l.userEmail || "")}</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid ${brand.border};text-align:right;font-size:13px;color:${brand.text};font-variant-numeric:tabular-nums">${l.calls}</td>
      <td style="padding:12px 16px;border-bottom:1px solid ${brand.border};text-align:right;font-size:13px;font-family:'SF Mono',Menlo,monospace;color:${brand.text}">${fmt(l.costUsd)}</td>
    </tr>`
    )
    .join("");

  const emptyRow = `<tr><td colspan="3" style="padding:32px 16px;text-align:center;color:${brand.muted};font-size:13px">No usage recorded for this period.</td></tr>`;

  const businessAddress = BUSINESS.addressLines
    .map((l) => escapeHtml(l))
    .join("<br/>");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Invoice ${escapeHtml(invoiceNumber)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f3f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${brand.text};-webkit-font-smoothing:antialiased">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;padding:0">

    <!-- Header bar -->
    <table width="100%" style="border-collapse:collapse">
      <tr>
        <td style="padding:32px 40px 24px 40px;vertical-align:top">
          <!-- convra. wordmark -->
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:32px;font-weight:300;letter-spacing:1px;color:${brand.primary};line-height:1">
            convra<span style="color:${brand.accent}">.</span>
          </div>
          <div style="margin-top:6px;color:${brand.muted};font-size:11px;letter-spacing:1.5px;text-transform:uppercase">${escapeHtml(BUSINESS.website)}</div>
        </td>
        <td style="padding:32px 40px 24px 40px;vertical-align:top;text-align:right">
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${brand.muted};margin-bottom:8px">Invoice</div>
          <div style="font-size:18px;font-weight:600;font-family:'SF Mono',Menlo,monospace;color:${brand.text}">${escapeHtml(invoiceNumber)}</div>
        </td>
      </tr>
    </table>

    <!-- Accent divider -->
    <div style="height:3px;background:linear-gradient(to right, ${brand.primary} 0%, ${brand.primary} 70%, ${brand.accent} 70%, ${brand.accent} 100%)"></div>

    <!-- Bill To / From -->
    <table width="100%" style="border-collapse:collapse">
      <tr>
        <td style="padding:32px 40px 16px 40px;vertical-align:top;width:50%">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${brand.muted};margin-bottom:10px">Billed to</div>
          <div style="font-size:15px;font-weight:600;color:${brand.text};margin-bottom:4px">${escapeHtml(data.company.name)}</div>
          <div style="font-size:12px;color:${brand.muted};font-family:'SF Mono',Menlo,monospace">${escapeHtml(data.company.email)}</div>
        </td>
        <td style="padding:32px 40px 16px 40px;vertical-align:top;width:50%;text-align:right">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${brand.muted};margin-bottom:10px">From</div>
          <div style="font-size:14px;font-weight:600;color:${brand.text};margin-bottom:4px">${escapeHtml(BUSINESS.legalName)}</div>
          <div style="font-size:12px;color:${brand.muted};line-height:1.6">${businessAddress}</div>
          <div style="font-size:11px;color:${brand.muted};margin-top:8px;font-family:'SF Mono',Menlo,monospace">${escapeHtml(BUSINESS.email)}<br/>${escapeHtml(BUSINESS.phone)}</div>
        </td>
      </tr>
    </table>

    <!-- Meta strip -->
    <table width="100%" style="border-collapse:collapse;margin:0 40px;width:calc(100% - 80px)">
      <tr>
        <td style="background:${brand.softBg};border-radius:8px;padding:16px 20px">
          <table width="100%" style="border-collapse:collapse">
            <tr>
              <td style="vertical-align:top">
                <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:${brand.muted};margin-bottom:4px">Period</div>
                <div style="font-size:13px;font-weight:600;color:${brand.text}">${escapeHtml(data.periodLabel)}</div>
              </td>
              <td style="vertical-align:top">
                <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:${brand.muted};margin-bottom:4px">Issued</div>
                <div style="font-size:13px;font-weight:600;color:${brand.text}">${formatDate(issueTs)}</div>
              </td>
              <td style="vertical-align:top">
                <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:${brand.muted};margin-bottom:4px">Due</div>
                <div style="font-size:13px;font-weight:600;color:${brand.accent}">${formatDate(dueTs)}</div>
              </td>
              <td style="vertical-align:top;text-align:right">
                <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:${brand.muted};margin-bottom:4px">Currency</div>
                <div style="font-size:13px;font-weight:600;color:${brand.text}">USD</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Line items table -->
    <div style="padding:24px 40px 0 40px">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${brand.muted};margin-bottom:12px">Usage Details</div>
      <table width="100%" style="border-collapse:collapse;border:1px solid ${brand.border};border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:${brand.text}">
            <th style="padding:12px 16px;text-align:left;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#fff;font-weight:500">User</th>
            <th style="padding:12px 16px;text-align:right;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#fff;font-weight:500">Calls</th>
            <th style="padding:12px 16px;text-align:right;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#fff;font-weight:500">Cost</th>
          </tr>
        </thead>
        <tbody>${lineRows || emptyRow}</tbody>
      </table>
    </div>

    <!-- Totals -->
    <div style="padding:16px 40px 0 40px">
      <table width="100%" style="border-collapse:collapse">
        <tr>
          <td style="text-align:right;padding:8px 16px;color:${brand.muted};font-size:12px">Total Calls</td>
          <td style="text-align:right;padding:8px 16px;font-size:13px;color:${brand.text};font-variant-numeric:tabular-nums;width:140px">${data.totalCalls}</td>
        </tr>
        <tr>
          <td style="text-align:right;padding:8px 16px;color:${brand.muted};font-size:12px;border-top:1px solid ${brand.border}">Subtotal</td>
          <td style="text-align:right;padding:8px 16px;font-size:13px;color:${brand.text};font-family:'SF Mono',Menlo,monospace;border-top:1px solid ${brand.border};width:140px">${fmt(data.totalCostUsd)}</td>
        </tr>
        <tr>
          <td style="text-align:right;padding:8px 16px;color:${brand.muted};font-size:11px">Tax</td>
          <td style="text-align:right;padding:8px 16px;font-size:11px;color:${brand.muted};width:140px">—</td>
        </tr>
        <tr>
          <td style="text-align:right;padding:14px 16px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${brand.text};font-weight:600;border-top:2px solid ${brand.text}">Total Due</td>
          <td style="text-align:right;padding:14px 16px;font-size:18px;color:${brand.text};font-family:'SF Mono',Menlo,monospace;font-weight:700;border-top:2px solid ${brand.text};width:140px">${fmtUsd(data.totalCostUsd)}</td>
        </tr>
      </table>
    </div>

    <!-- Payment Instructions -->
    <div style="padding:32px 40px 0 40px">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${brand.muted};margin-bottom:12px">Payment Instructions</div>
      <table width="100%" style="border-collapse:collapse;border-left:3px solid ${brand.accent};background:${brand.softBg}">
        <tr>
          <td style="padding:18px 20px;font-size:12px;color:${brand.text};line-height:1.8">
            <div style="margin-bottom:8px;color:${brand.muted};font-size:11px">Wire transfer (USD or local equivalent) — payment terms: <strong style="color:${brand.text}">Net ${INVOICE_DEFAULTS.netDays} days</strong></div>
            <table width="100%" style="border-collapse:collapse;margin-top:8px;font-size:12px">
              <tr><td style="padding:3px 0;color:${brand.muted};width:120px">Beneficiary</td><td style="padding:3px 0;color:${brand.text};font-weight:500">${escapeHtml(BANK.beneficiary)} <span style="color:${brand.muted}">(${escapeHtml(BANK.beneficiaryZh)})</span></td></tr>
              <tr><td style="padding:3px 0;color:${brand.muted}">Bank</td><td style="padding:3px 0;color:${brand.text}">${escapeHtml(BANK.bank)}</td></tr>
              <tr><td style="padding:3px 0;color:${brand.muted}">Branch</td><td style="padding:3px 0;color:${brand.text}">${escapeHtml(BANK.branch)}</td></tr>
              <tr><td style="padding:3px 0;color:${brand.muted}">Account No.</td><td style="padding:3px 0;color:${brand.text};font-family:'SF Mono',Menlo,monospace">${escapeHtml(BANK.account)}</td></tr>
              <tr><td style="padding:3px 0;color:${brand.muted}">Bank Code</td><td style="padding:3px 0;color:${brand.text};font-family:'SF Mono',Menlo,monospace">${escapeHtml(BANK.bankCode)}</td></tr>
              <tr><td style="padding:3px 0;color:${brand.muted}">SWIFT / BIC</td><td style="padding:3px 0;color:${brand.text};font-family:'SF Mono',Menlo,monospace">${escapeHtml(BANK.swift)}</td></tr>
            </table>
            <div style="margin-top:12px;padding-top:10px;border-top:1px solid ${brand.border};color:${brand.muted};font-size:11px">
              Please include invoice number <strong style="color:${brand.text};font-family:'SF Mono',Menlo,monospace">${escapeHtml(invoiceNumber)}</strong> in the wire transfer reference.
            </div>
          </td>
        </tr>
      </table>
    </div>

    ${data.company.notes ? `
    <div style="padding:24px 40px 0 40px">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${brand.muted};margin-bottom:8px">Notes</div>
      <div style="font-size:12px;color:${brand.muted};line-height:1.6;white-space:pre-wrap">${escapeHtml(data.company.notes)}</div>
    </div>` : ""}

    <!-- Footer -->
    <div style="padding:40px 40px 32px 40px;margin-top:24px;border-top:1px solid ${brand.border}">
      <div style="font-size:13px;color:${brand.text};margin-bottom:6px">${escapeHtml(INVOICE_DEFAULTS.thankYou)}</div>
      <div style="font-size:11px;color:${brand.muted};line-height:1.6">${escapeHtml(INVOICE_DEFAULTS.legal)}</div>
      <div style="font-size:10px;color:${brand.muted};margin-top:16px;letter-spacing:0.5px">
        Questions about this invoice? Reply to this email and it will reach <strong style="color:${brand.text}">${escapeHtml(BUSINESS.email)}</strong> directly.
      </div>
    </div>

  </div>

  <!-- Outer footer -->
  <div style="text-align:center;padding:16px 24px;color:${brand.muted};font-size:10px">
    ${escapeHtml(BUSINESS.legalName)} &middot; ${escapeHtml(BUSINESS.website)}
  </div>
</body>
</html>`;
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
 * Requires RESEND_API_KEY env var; returns ok:false otherwise.
 *
 * @param data        Invoice data (must have invoiceNumber by send time)
 * @param attachments Optional file attachments (e.g. PDF copy)
 */
export async function sendInvoiceEmail(
  data: InvoiceData,
  attachments?: { filename: string; content: string /* base64 */ }[]
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  // Accept either RESEND_API_KEY (canonical) or RESEND_KEY (shorthand)
  const apiKey = process.env.RESEND_API_KEY || process.env.RESEND_KEY;
  const fromAddr = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  if (!apiKey) {
    return {
      ok: false,
      error: "RESEND_API_KEY (or RESEND_KEY) not configured. Set it in env to enable email sending.",
    };
  }

  const html = renderInvoiceHtml(data);
  const invNum = data.invoiceNumber || "INV";
  const subject = `Invoice ${invNum} from ${BUSINESS.legalName} — ${data.periodLabel}`;

  const payload: Record<string, unknown> = {
    from: fromAddr,
    to: data.company.email,
    subject,
    html,
    reply_to: BUSINESS.email,
  };

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
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
