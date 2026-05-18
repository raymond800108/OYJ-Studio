import { getRedis } from "@/lib/redis";
import type { GoogleSheetsConnection } from "@/app/api/auth/google-sheets/callback/route";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

/**
 * Get a valid Sheets access token for the user, refreshing if expired.
 * Returns null if the user hasn't connected Sheets, or refresh failed
 * (in which case Redis is cleared so the UI re-prompts to reconnect).
 */
export async function getValidSheetsToken(userId: string): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;

  const raw = await redis.get(`google:sheets:${userId}`);
  if (!raw) return null;

  const conn: GoogleSheetsConnection =
    typeof raw === "string" ? JSON.parse(raw) : (raw as GoogleSheetsConnection);

  // Still valid (with 60s safety margin)
  if (conn.token_expires_at - 60_000 > Date.now()) {
    return conn.access_token;
  }

  // Refresh
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: conn.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (!data.access_token) {
      // refresh_token revoked / expired — drop the connection
      console.error("[sheets] refresh failed:", data);
      await redis.del(`google:sheets:${userId}`);
      return null;
    }

    const updated: GoogleSheetsConnection = {
      ...conn,
      access_token: data.access_token,
      token_expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    await redis.set(`google:sheets:${userId}`, JSON.stringify(updated));
    return data.access_token;
  } catch (e) {
    console.error("[sheets] refresh error:", e);
    return null;
  }
}

/**
 * Extract a spreadsheet ID from any of the URL forms Google uses:
 *   https://docs.google.com/spreadsheets/d/<ID>/edit#gid=...
 *   https://docs.google.com/spreadsheets/d/<ID>/edit?gid=...
 *   <ID> itself
 */
export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

/** Parse `gid` from the URL (the sheet tab id) — needed to map to a sheet name. */
export function parseGid(input: string): string | null {
  const m = input.match(/[#?&]gid=(\d+)/);
  return m ? m[1] : null;
}

export interface SheetTab {
  sheetId: number;
  title: string;
  index: number;
}

export async function getSheetTabs(
  spreadsheetId: string,
  accessToken: string
): Promise<SheetTab[]> {
  const url = `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties(sheetId,title,index)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Sheets metadata fetch failed: ${res.status} ${errBody}`);
  }
  const data = (await res.json()) as {
    sheets?: { properties: { sheetId: number; title: string; index: number } }[];
  };
  return (data.sheets ?? []).map((s) => s.properties);
}

/**
 * Read a raw range from a sheet. Returns a 2D array of strings (Sheets API
 * returns mixed types; we coerce to string for predictable column access).
 */
export async function readSheetRange(
  spreadsheetId: string,
  range: string,
  accessToken: string
): Promise<string[][]> {
  const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Sheets values fetch failed: ${res.status} ${errBody}`);
  }
  const data = (await res.json()) as { values?: unknown[][] };
  return (data.values ?? []).map((row) =>
    row.map((cell) => (cell == null ? "" : String(cell)))
  );
}
