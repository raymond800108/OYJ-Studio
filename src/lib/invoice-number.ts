import { getRedis } from "./redis";
import { INVOICE_DEFAULTS } from "./business";

/**
 * Allocate a sequential invoice number for a given year/month.
 * Format: `{prefix}-{YYYY}-{MM}-{NNN}` (zero-padded sequential per month).
 *
 * Uses Redis INCR for atomic monotonic numbering. Falls back to a
 * timestamp-based number if Redis is unavailable (so test sends
 * still produce a plausible-looking number).
 */
export async function allocateInvoiceNumber(
  year: number,
  month: number
): Promise<string> {
  const yyyy = String(year);
  const mm = String(month).padStart(2, "0");
  const redis = getRedis();
  if (!redis) {
    // Fallback: timestamp-based suffix
    return `${INVOICE_DEFAULTS.numberPrefix}-${yyyy}-${mm}-T${Date.now()
      .toString()
      .slice(-3)}`;
  }
  const key = `ce:invoice:seq:${yyyy}-${mm}`;
  const seq = await redis.incr(key);
  return `${INVOICE_DEFAULTS.numberPrefix}-${yyyy}-${mm}-${String(seq).padStart(
    3,
    "0"
  )}`;
}

/**
 * Build a deterministic preview number for previews/test sends that
 * shouldn't burn a real sequence number.
 */
export function previewInvoiceNumber(year: number, month: number): string {
  const yyyy = String(year);
  const mm = String(month).padStart(2, "0");
  return `${INVOICE_DEFAULTS.numberPrefix}-${yyyy}-${mm}-PREVIEW`;
}

/**
 * Peek the NEXT invoice number that would be allocated if you sent a
 * real invoice right now — without actually incrementing the counter.
 * Used by test-send so the email looks identical to the real one,
 * without "burning" a sequence number every test.
 */
export async function peekNextInvoiceNumber(
  year: number,
  month: number
): Promise<string> {
  const yyyy = String(year);
  const mm = String(month).padStart(2, "0");
  const redis = getRedis();
  if (!redis) {
    return `${INVOICE_DEFAULTS.numberPrefix}-${yyyy}-${mm}-001`;
  }
  const key = `ce:invoice:seq:${yyyy}-${mm}`;
  const current = (await redis.get(key)) as number | string | null;
  const nextSeq = (typeof current === "number" ? current : Number(current) || 0) + 1;
  return `${INVOICE_DEFAULTS.numberPrefix}-${yyyy}-${mm}-${String(nextSeq).padStart(
    3,
    "0"
  )}`;
}
