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
 * POST /api/google-sheets/preview
 * Body: {
 *   sheetUrl: string,
 *   tabName?: string,
 *   mapping: {
 *     titleCol: string,          // "B"
 *     captionCols: string[],     // ["E"] or ["D","E"] — joined with double newline
 *     dropboxCol: string,        // "I" / "O" etc — must contain a Dropbox link
 *     subtitleCols?: string[],   // ["A","C"] — joined with " · " for card meta line
 *     filter?: {
 *       col: string,             // column letter to inspect
 *       includeValues?: string[],// only keep rows where col ∈ these
 *       excludeValues?: string[],// drop rows where col ∈ these
 *     },
 *   },
 *   limit?: number,
 * }
 *
 * Returns rows shaped according to the mapping. Generic — works for any
 * sheet layout because the client picks which column does what.
 */

export interface MappedRow {
  rowIndex: number; // 1-based
  title: string;
  subtitle: string;
  caption: string;     // joined caption-source cells (the seed for AI polish)
  dropboxUrl: string;
  raw: Record<string, string>; // letter → cell value, only for mapped columns
}

function colLetterToIndex(letter: string): number {
  let s = letter.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(s)) return -1;
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n - 1;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getValidSheetsToken(session.userId);
  if (!token) {
    return NextResponse.json({ error: "SHEETS_NOT_CONNECTED" }, { status: 401 });
  }

  const body = (await req.json()) as {
    sheetUrl?: string;
    tabName?: string;
    mapping?: {
      titleCol?: string;
      captionCols?: string[];
      dropboxCol?: string;
      subtitleCols?: string[];
      filter?: {
        col?: string;
        includeValues?: string[];
        excludeValues?: string[];
      };
    };
    limit?: number;
  };

  const sheetUrl = (body.sheetUrl || "").trim();
  const limit = Math.max(1, Math.min(body.limit ?? 200, 1000));
  const mapping = body.mapping ?? {};
  const titleCol = (mapping.titleCol || "").toUpperCase();
  const captionCols = (mapping.captionCols || []).map((c) => c.toUpperCase());
  const dropboxCol = (mapping.dropboxCol || "").toUpperCase();
  const subtitleCols = (mapping.subtitleCols || []).map((c) => c.toUpperCase());
  const filterCol = mapping.filter?.col?.toUpperCase() || "";
  const filterInclude = (mapping.filter?.includeValues ?? []).map((v) => v.trim()).filter(Boolean);
  const filterExclude = (mapping.filter?.excludeValues ?? []).map((v) => v.trim()).filter(Boolean);

  if (!titleCol && captionCols.length === 0 && !dropboxCol) {
    return NextResponse.json(
      { error: "Mapping must specify at least one of titleCol / captionCols / dropboxCol." },
      { status: 400 }
    );
  }

  const spreadsheetId = parseSpreadsheetId(sheetUrl);
  if (!spreadsheetId) {
    return NextResponse.json({ error: "INVALID_SHEET_URL" }, { status: 400 });
  }

  // Resolve active tab
  let tabName = body.tabName;
  try {
    const tabs = await getSheetTabs(spreadsheetId, token);
    if (tabs.length === 0) {
      return NextResponse.json({ error: "NO_TABS_FOUND" }, { status: 400 });
    }
    if (!tabName) {
      const wantedGid = parseGid(sheetUrl);
      const matched = wantedGid
        ? tabs.find((t) => String(t.sheetId) === wantedGid)
        : null;
      tabName = (matched ?? tabs[0]).title;
    } else if (!tabs.find((t) => t.title === tabName)) {
      // tab name from client doesn't exist anymore — fall back
      tabName = tabs[0].title;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load sheet";
    if (msg.includes("403") || msg.includes("PERMISSION_DENIED")) {
      return NextResponse.json({ error: "PERMISSION_DENIED" }, { status: 403 });
    }
    if (msg.includes("404")) {
      return NextResponse.json({ error: "SHEET_NOT_FOUND" }, { status: 404 });
    }
    console.error("[sheets/preview] tabs error:", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Compute the largest column letter we need to read — read up to ZZ to be safe
  let values: string[][];
  try {
    const range = `${tabName}!A2:ZZ`;
    values = await readSheetRange(spreadsheetId, range, token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to read sheet";
    console.error("[sheets/preview] values error:", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const titleIdx = colLetterToIndex(titleCol);
  const captionIdxs = captionCols.map(colLetterToIndex).filter((n) => n >= 0);
  const dropboxIdx = colLetterToIndex(dropboxCol);
  const subtitleIdxs = subtitleCols.map(colLetterToIndex).filter((n) => n >= 0);
  const filterIdx = filterCol ? colLetterToIndex(filterCol) : -1;

  const out: MappedRow[] = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (!r || r.length === 0) continue;

    // Apply filter first
    if (filterIdx >= 0) {
      const v = (r[filterIdx] || "").trim();
      if (filterInclude.length > 0 && !filterInclude.includes(v)) continue;
      if (filterExclude.length > 0 && filterExclude.includes(v)) continue;
    }

    const title = titleIdx >= 0 ? (r[titleIdx] || "").trim() : "";
    const subtitle = subtitleIdxs
      .map((idx) => (r[idx] || "").trim())
      .filter(Boolean)
      .join(" · ");
    const caption = captionIdxs
      .map((idx) => (r[idx] || "").trim())
      .filter(Boolean)
      .join("\n\n");
    const dropboxUrl = dropboxIdx >= 0 ? (r[dropboxIdx] || "").trim() : "";

    // Skip totally-empty rows (no title, no caption, no media)
    if (!title && !caption && !dropboxUrl) continue;

    const raw: Record<string, string> = {};
    if (titleCol) raw[titleCol] = title;
    captionCols.forEach((c, k) => {
      const idx = captionIdxs[k];
      if (idx >= 0) raw[c] = (r[idx] || "").trim();
    });
    if (dropboxCol) raw[dropboxCol] = dropboxUrl;
    subtitleCols.forEach((c, k) => {
      const idx = subtitleIdxs[k];
      if (idx >= 0) raw[c] = (r[idx] || "").trim();
    });
    if (filterCol && filterIdx >= 0) raw[filterCol] = (r[filterIdx] || "").trim();

    out.push({
      rowIndex: i + 2,
      title,
      subtitle,
      caption,
      dropboxUrl,
      raw,
    });
    if (out.length >= limit) break;
  }

  return NextResponse.json({
    spreadsheetId,
    tabName,
    totalScanned: values.length,
    totalReturned: out.length,
    rows: out,
  });
}
