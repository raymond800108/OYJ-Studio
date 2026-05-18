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
 * Body: { sheetUrl: string, limit?: number }
 *
 * Reads the user's "珠寶訂製作品素材表"-shaped sheet, filters to rows where:
 *   - column K (客人同意露出) ≈ "v"            (approved)
 *   - column L (IG)            is empty       (not posted to IG yet)
 *
 * Column mapping is hardcoded against the user's current sheet — column
 * positions match: A=分類, B=名稱, C=主石, D=寶石數據, E=相關資訊,
 * I=完成素材(Dropbox), K=客人同意露出, L=IG, M=FB.
 */

const APPROVE_VALUES = new Set(["v", "V", "✓", "✔", "yes", "Yes", "YES", "是", "可"]);

export interface SheetRowPreview {
  rowIndex: number; // 1-based row in the sheet (so row 2 = first data row)
  category: string; // A
  name: string; // B
  mainStone: string; // C
  stoneSpec: string; // D
  relatedInfo: string; // E (becomes caption seed in Phase 3)
  dropboxUrl: string; // I
  notes: string; // J
  approved: boolean; // K
  approvedRaw: string;
  postedInstagram: string; // L
  postedFacebook: string; // M
}

const COL = {
  category: 0, // A
  name: 1, // B
  mainStone: 2, // C
  stoneSpec: 3, // D
  relatedInfo: 4, // E
  // F=原圖, G=素材風格, H=(empty)
  dropboxUrl: 8, // I
  notes: 9, // J
  approved: 10, // K
  postedInstagram: 11, // L
  postedFacebook: 12, // M
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getValidSheetsToken(session.userId);
  if (!token) {
    return NextResponse.json(
      { error: "SHEETS_NOT_CONNECTED" },
      { status: 401 }
    );
  }

  const body = (await req.json()) as { sheetUrl?: string; limit?: number };
  const sheetUrl = (body.sheetUrl || "").trim();
  const limit = Math.max(1, Math.min(body.limit ?? 50, 500));

  const spreadsheetId = parseSpreadsheetId(sheetUrl);
  if (!spreadsheetId) {
    return NextResponse.json({ error: "INVALID_SHEET_URL" }, { status: 400 });
  }

  // Figure out which tab to read — prefer the gid from the URL, else first tab
  let tabName: string;
  try {
    const tabs = await getSheetTabs(spreadsheetId, token);
    if (tabs.length === 0) {
      return NextResponse.json({ error: "NO_TABS_FOUND" }, { status: 400 });
    }
    const wantedGid = parseGid(sheetUrl);
    const matched = wantedGid
      ? tabs.find((t) => String(t.sheetId) === wantedGid)
      : null;
    tabName = (matched ?? tabs[0]).title;
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

  // Read enough columns to cover A..M (13 columns), starting at row 2 to skip header
  let values: string[][];
  try {
    const range = `${tabName}!A2:M`;
    values = await readSheetRange(spreadsheetId, range, token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to read sheet";
    console.error("[sheets/preview] values error:", e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const rows: SheetRowPreview[] = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (!r || r.length === 0) continue;
    const approvedRaw = (r[COL.approved] || "").trim();
    const postedInstagram = (r[COL.postedInstagram] || "").trim();
    const approved = APPROVE_VALUES.has(approvedRaw);
    if (!approved) continue;
    if (postedInstagram) continue; // already posted to IG

    rows.push({
      rowIndex: i + 2, // header is row 1, so data starts at row 2
      category: (r[COL.category] || "").trim(),
      name: (r[COL.name] || "").trim(),
      mainStone: (r[COL.mainStone] || "").trim(),
      stoneSpec: (r[COL.stoneSpec] || "").trim(),
      relatedInfo: (r[COL.relatedInfo] || "").trim(),
      dropboxUrl: (r[COL.dropboxUrl] || "").trim(),
      notes: (r[COL.notes] || "").trim(),
      approved: true,
      approvedRaw,
      postedInstagram,
      postedFacebook: (r[COL.postedFacebook] || "").trim(),
    });
    if (rows.length >= limit) break;
  }

  return NextResponse.json({
    spreadsheetId,
    tabName,
    totalScanned: values.length,
    totalReturned: rows.length,
    rows,
  });
}
