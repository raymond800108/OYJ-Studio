import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getValidSheetsToken,
  parseSpreadsheetId,
  parseGid,
  getSheetTabs,
  readSheetRange,
} from "@/lib/google-sheets";

/**
 * POST /api/google-sheets/headers
 * Body: { sheetUrl: string, tabName?: string }
 *
 * Returns the list of tabs in the spreadsheet plus the row-1 headers
 * of the active tab. The Compose page uses this to build a column-
 * mapping UI that adapts to whatever Sheet the user pastes in (no
 * more hardcoded "K = approval, L = IG" assumptions).
 */

export interface HeaderEntry {
  /** Column letter ("A", "B", ... "AA") */
  letter: string;
  /** Zero-based index */
  index: number;
  /** Cell value from row 1, trimmed */
  header: string;
}

function columnIndexToLetter(index: number): string {
  let n = index;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getValidSheetsToken(session.userId);
  if (!token) {
    return NextResponse.json({ error: "SHEETS_NOT_CONNECTED" }, { status: 401 });
  }

  const body = (await req.json()) as { sheetUrl?: string; tabName?: string };
  const sheetUrl = (body.sheetUrl || "").trim();
  const spreadsheetId = parseSpreadsheetId(sheetUrl);
  if (!spreadsheetId) {
    return NextResponse.json({ error: "INVALID_SHEET_URL" }, { status: 400 });
  }

  // Get tabs
  let tabs;
  try {
    tabs = await getSheetTabs(spreadsheetId, token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load sheet";
    if (msg.includes("403") || msg.includes("PERMISSION_DENIED")) {
      return NextResponse.json({ error: "PERMISSION_DENIED" }, { status: 403 });
    }
    if (msg.includes("404")) {
      return NextResponse.json({ error: "SHEET_NOT_FOUND" }, { status: 404 });
    }
    console.error("[sheets/headers] tabs error:", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  if (tabs.length === 0) {
    return NextResponse.json({ error: "NO_TABS_FOUND" }, { status: 400 });
  }

  // Pick the active tab: preferred name → gid in URL → first tab
  const wantedGid = parseGid(sheetUrl);
  let activeTab = tabs[0];
  if (body.tabName) {
    const m = tabs.find((t) => t.title === body.tabName);
    if (m) activeTab = m;
  } else if (wantedGid) {
    const m = tabs.find((t) => String(t.sheetId) === wantedGid);
    if (m) activeTab = m;
  }

  // Read header row (row 1) — A1:ZZ1
  let headers: HeaderEntry[] = [];
  try {
    const range = `${activeTab.title}!1:1`;
    const values = await readSheetRange(spreadsheetId, range, token);
    const row = values[0] ?? [];
    headers = row.map((cell, i) => ({
      letter: columnIndexToLetter(i),
      index: i,
      header: cell.trim(),
    }));
    // Trim trailing empty headers
    while (headers.length > 0 && !headers[headers.length - 1].header) {
      headers.pop();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to read headers";
    console.error("[sheets/headers] header read error:", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({
    spreadsheetId,
    activeTab: {
      sheetId: activeTab.sheetId,
      title: activeTab.title,
      index: activeTab.index,
    },
    tabs: tabs.map((t) => ({
      sheetId: t.sheetId,
      title: t.title,
      index: t.index,
    })),
    headers,
  });
}
