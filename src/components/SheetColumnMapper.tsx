"use client";

import { X, Wand2 } from "lucide-react";

export interface HeaderEntry {
  letter: string;
  index: number;
  header: string;
}

export interface ColumnMapping {
  titleCol: string;            // single column letter, e.g. "B"
  subtitleCols: string[];      // ordered list, joined by " · " on the card
  captionCols: string[];       // ordered list, joined by "\n\n" for AI seed
  dropboxCol: string;          // single column letter
  filter?: {
    col: string;
    excludeValues: string[];   // skip rows where filter col is in this list
  };
}

const EMPTY_MAPPING: ColumnMapping = {
  titleCol: "",
  subtitleCols: [],
  captionCols: [],
  dropboxCol: "",
};

/* ─── Auto-detect ────────────────────────────────────────────────── */

const TITLE_KEYWORDS = ["主旨", "標題", "名稱", "title", "subject"];
const SUBTITLE_KEYWORDS = ["分類", "主石", "主題", "category", "topic", "tag"];
const CAPTION_KEYWORDS = ["內容", "相關資訊", "content", "description", "story", "備註"];
const DROPBOX_KEYWORDS = ["素材庫", "完成素材", "dropbox", "media", "連結", "url", "link"];

function matchHeader(headers: HeaderEntry[], keywords: string[]): string {
  for (const kw of keywords) {
    const found = headers.find((h) => h.header.toLowerCase().includes(kw.toLowerCase()));
    if (found) return found.letter;
  }
  return "";
}

export function autoDetectMapping(headers: HeaderEntry[]): ColumnMapping {
  const titleCol = matchHeader(headers, TITLE_KEYWORDS);
  const subtitleCol = matchHeader(headers, SUBTITLE_KEYWORDS);
  const captionCol = matchHeader(headers, CAPTION_KEYWORDS);
  const dropboxCol = matchHeader(headers, DROPBOX_KEYWORDS);
  return {
    titleCol,
    subtitleCols: subtitleCol ? [subtitleCol] : [],
    captionCols: captionCol ? [captionCol] : [],
    dropboxCol,
  };
}

export { EMPTY_MAPPING };

/* ─── Component ──────────────────────────────────────────────────── */

interface SheetColumnMapperProps {
  headers: HeaderEntry[];
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
  onAutoDetect: () => void;
  /** Localized labels */
  labels: {
    title: string;          // "Column mapping"
    titleSub: string;       // "Tell us which column means what"
    autoDetect: string;     // "Auto-detect"
    titleCol: string;       // "Title column"
    subtitleCols: string;   // "Subtitle columns (optional, ordered)"
    captionCols: string;    // "Caption source columns (ordered, joined)"
    dropboxCol: string;     // "Dropbox folder URL column"
    none: string;           // "— (none) —"
    addCol: string;         // "Add column"
  };
}

export default function SheetColumnMapper({
  headers,
  mapping,
  onChange,
  onAutoDetect,
  labels,
}: SheetColumnMapperProps) {
  const update = (patch: Partial<ColumnMapping>) =>
    onChange({ ...mapping, ...patch });

  const addToList = (key: "subtitleCols" | "captionCols", letter: string) => {
    if (!letter || mapping[key].includes(letter)) return;
    update({ [key]: [...mapping[key], letter] } as Partial<ColumnMapping>);
  };
  const removeFromList = (key: "subtitleCols" | "captionCols", letter: string) =>
    update({ [key]: mapping[key].filter((c) => c !== letter) } as Partial<ColumnMapping>);

  return (
    <div className="rounded-xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{labels.title}</p>
          <p className="text-xs text-muted mt-0.5">{labels.titleSub}</p>
        </div>
        <button
          onClick={onAutoDetect}
          className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-[11px] font-medium hover:border-foreground/40 flex items-center gap-1"
        >
          <Wand2 className="w-3 h-3" />
          {labels.autoDetect}
        </button>
      </div>

      {/* Title column */}
      <Row label={labels.titleCol}>
        <SingleColumnSelect
          value={mapping.titleCol}
          onChange={(v) => update({ titleCol: v })}
          headers={headers}
          noneLabel={labels.none}
        />
      </Row>

      {/* Subtitle columns (multi) */}
      <Row label={labels.subtitleCols}>
        <MultiColumnSelector
          values={mapping.subtitleCols}
          onAdd={(v) => addToList("subtitleCols", v)}
          onRemove={(v) => removeFromList("subtitleCols", v)}
          headers={headers}
          noneLabel={labels.none}
          addLabel={labels.addCol}
        />
      </Row>

      {/* Caption columns (multi) */}
      <Row label={labels.captionCols}>
        <MultiColumnSelector
          values={mapping.captionCols}
          onAdd={(v) => addToList("captionCols", v)}
          onRemove={(v) => removeFromList("captionCols", v)}
          headers={headers}
          noneLabel={labels.none}
          addLabel={labels.addCol}
        />
      </Row>

      {/* Dropbox column */}
      <Row label={labels.dropboxCol}>
        <SingleColumnSelect
          value={mapping.dropboxCol}
          onChange={(v) => update({ dropboxCol: v })}
          headers={headers}
          noneLabel={labels.none}
        />
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[12rem,1fr] items-start gap-2">
      <label className="text-xs font-medium text-foreground/80 pt-1.5">{label}</label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SingleColumnSelect({
  value,
  onChange,
  headers,
  noneLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  headers: HeaderEntry[];
  noneLabel: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs"
    >
      <option value="">{noneLabel}</option>
      {headers.map((h) => (
        <option key={h.letter} value={h.letter}>
          {h.letter}: {h.header || "(empty)"}
        </option>
      ))}
    </select>
  );
}

function MultiColumnSelector({
  values,
  onAdd,
  onRemove,
  headers,
  noneLabel,
  addLabel,
}: {
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  headers: HeaderEntry[];
  noneLabel: string;
  addLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      {values.length === 0 && (
        <p className="text-[11px] text-muted">{noneLabel}</p>
      )}
      {values.map((letter) => {
        const h = headers.find((x) => x.letter === letter);
        return (
          <div
            key={letter}
            className="inline-flex items-center gap-1.5 mr-1.5 px-2.5 py-1 rounded-lg bg-foreground text-background text-xs"
          >
            <span className="font-mono">{letter}</span>
            <span className="truncate max-w-[10rem]">{h?.header || "(empty)"}</span>
            <button
              onClick={() => onRemove(letter)}
              className="opacity-70 hover:opacity-100"
              aria-label="remove"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
      <div>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onAdd(e.target.value);
            e.currentTarget.selectedIndex = 0;
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-background border border-dashed border-border text-xs hover:border-foreground/40"
        >
          <option value="">＋ {addLabel}</option>
          {headers
            .filter((h) => !values.includes(h.letter))
            .map((h) => (
              <option key={h.letter} value={h.letter}>
                {h.letter}: {h.header || "(empty)"}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}

