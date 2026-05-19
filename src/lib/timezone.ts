/**
 * Convert a user-picked wall-clock date+time in a specific IANA timezone
 * into an absolute UTC millisecond timestamp.
 *
 * Example:
 *   localToUtcMs("2026-05-20", "12:00", "Asia/Taipei")
 *   → the UTC ms corresponding to 12:00 Taipei time (== 04:00 UTC)
 *
 * The implementation does NOT use any libraries — it leans on
 * Intl.DateTimeFormat to ask "what wall-clock does this UTC instant
 * show in target tz?", then computes the offset and corrects.
 */
export function localToUtcMs(
  dateIso: string,        // "YYYY-MM-DD"
  timeIso: string,        // "HH:MM" (24h)
  timeZone: string        // IANA, e.g. "Asia/Taipei"
): number {
  const [y, mo, d] = dateIso.split("-").map(Number);
  const [h, m] = timeIso.split(":").map(Number);
  if ([y, mo, d, h, m].some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid date/time: ${dateIso} ${timeIso}`);
  }

  // First guess: pretend the user-supplied wall-clock IS UTC.
  const naiveUtc = Date.UTC(y, mo - 1, d, h, m, 0);

  // Now ask Intl what that same instant looks like in the target tz.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(naiveUtc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const shownAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );

  // Offset = (what naïve-UTC shows in tz) - (naïve-UTC itself)
  // Correct true UTC = naïve-UTC - offset (subtract because the tz is
  // ahead/behind by that amount and we want the moment that shows the
  // user's wall-clock in tz).
  const offsetMs = shownAsUtc - naiveUtc;
  return naiveUtc - offsetMs;
}

/**
 * Sanity-check helper for the UI: returns the user-supplied date/time/tz
 * formatted as "MMM dd · HH:mm zzz" so we can show "this will publish at
 * Wed May 20 · 12:00 Asia/Taipei (04:00 UTC)" before the user confirms.
 */
export function formatLocalAndUtc(
  dateIso: string,
  timeIso: string,
  tz: string
): { localDisplay: string; utcDisplay: string; utcMs: number } {
  const utcMs = localToUtcMs(dateIso, timeIso, tz);
  const localDisplay = `${dateIso} ${timeIso} ${tz}`;
  const utcDisplay = new Date(utcMs).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return { localDisplay, utcDisplay, utcMs };
}
