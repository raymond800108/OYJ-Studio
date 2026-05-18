"use client";

import { useEffect, useState } from "react";
import {
  Sparkles,
  Loader2,
  Link2,
  Table2,
  Box,
  X,
  RefreshCw,
  Check,
  Send,
  CalendarPlus,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { useI18n, type TKey } from "@/lib/i18n";
import SheetColumnMapper, {
  autoDetectMapping,
  type ColumnMapping,
  type HeaderEntry,
} from "@/components/SheetColumnMapper";

/* ─── Types ──────────────────────────────────────────────────────── */

interface SheetTab {
  sheetId: number;
  title: string;
  index: number;
}

interface MappedRow {
  rowIndex: number;
  title: string;
  subtitle: string;
  caption: string;
  dropboxUrl: string;
  raw: Record<string, string>;
}

interface DropboxFileEntry {
  id: string;
  name: string;
  pathDisplay: string;
  sharedUrl: string;
  size: number;
  kind: "image" | "video";
  directUrl: string;
  displayUrl: string;
  webUrl: string;
}

interface CalendarPost {
  id: string;
  date: string;
  time: string;
  timezone: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  /** Additional image URLs for IG carousel (slides 2..N). */
  carouselUrls?: string[];
  caption: string;
  platform: string | null;
  publishedPostId: string | null;
  presetId: string | null;
  presetLabel: string | null;
  status: "draft" | "scheduled" | "published" | "failed";
}

/* ─── Helpers ────────────────────────────────────────────────────── */

const MAPPINGS_KEY = "ce:sheetMappings";

interface StoredMapping {
  tabName: string;
  mapping: ColumnMapping;
}

function loadStoredMappings(): Record<string, StoredMapping> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(MAPPINGS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStoredMapping(spreadsheetId: string, entry: StoredMapping) {
  if (typeof window === "undefined") return;
  const all = loadStoredMappings();
  all[spreadsheetId] = entry;
  localStorage.setItem(MAPPINGS_KEY, JSON.stringify(all));
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function userTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function appendToCalendar(post: CalendarPost) {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem("convra-calendar-posts") || "[]";
  try {
    const list = JSON.parse(raw) as CalendarPost[];
    list.push(post);
    localStorage.setItem("convra-calendar-posts", JSON.stringify(list));
  } catch {
    localStorage.setItem("convra-calendar-posts", JSON.stringify([post]));
  }
}

function isDropboxFolder(url: string): boolean {
  return /^https?:\/\/(www\.)?dropbox\.com\/(scl\/fo|sh|s)\//.test(url.trim());
}

/* ─── Component ──────────────────────────────────────────────────── */

export default function ComposeWorkbench() {
  const { t } = useI18n();

  // Connection state
  const [sheetsConnected, setSheetsConnected] = useState<boolean | null>(null);
  const [dropboxConnected, setDropboxConnected] = useState<boolean | null>(null);

  // Sheet input + step state
  const [sheetUrl, setSheetUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ce:lastSheetUrl") || "";
  });
  const [headersLoading, setHeadersLoading] = useState(false);
  const [headersError, setHeadersError] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [headers, setHeaders] = useState<HeaderEntry[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    titleCol: "",
    subtitleCols: [],
    captionCols: [],
    dropboxCol: "",
  });

  // Rows + composer state
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rows, setRows] = useState<MappedRow[] | null>(null);
  const [selectedRow, setSelectedRow] = useState<MappedRow | null>(null);

  // Composer drawer state
  const [files, setFiles] = useState<DropboxFileEntry[] | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState("");
  const [polishLoading, setPolishLoading] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string>(todayIso());
  const [scheduleTime, setScheduleTime] = useState<string>("12:00");
  const [publishStatus, setPublishStatus] = useState<
    | { phase: "idle" }
    | { phase: "scheduling" }   // 加入排程 spinner
    | { phase: "publishing" }   // 立即發布 spinner
    | { phase: "scheduled" | "published"; id?: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  /* ── Connection status (mount + OAuth redirect) ──────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, d] = await Promise.all([
          fetch("/api/google-sheets/status").then((r) => r.json()),
          fetch("/api/dropbox/status").then((r) => r.json()),
        ]);
        if (!cancelled) {
          setSheetsConnected(Boolean(s.connected));
          setDropboxConnected(Boolean(d.connected));
        }
      } catch {
        if (!cancelled) {
          setSheetsConnected(false);
          setDropboxConnected(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    let mutated = false;
    if (params.get("sheets_connected") === "1") {
      setSheetsConnected(true);
      params.delete("sheets_connected");
      mutated = true;
    }
    if (params.get("dropbox_connected") === "1") {
      setDropboxConnected(true);
      params.delete("dropbox_connected");
      mutated = true;
    }
    if (mutated) {
      const url = new URL(window.location.href);
      url.search = params.toString();
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  /* ── Load tabs + headers ─────────────────────────────────────── */
  async function loadHeaders(tabOverride?: string) {
    if (!sheetUrl.trim()) {
      setHeadersError(t("sheets.invalidUrl" as TKey));
      return;
    }
    setHeadersLoading(true);
    setHeadersError(null);
    setRows(null);
    setRowsError(null);
    try {
      localStorage.setItem("ce:lastSheetUrl", sheetUrl.trim());
      const r = await fetch("/api/google-sheets/headers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: sheetUrl.trim(), tabName: tabOverride }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.error === "SHEETS_NOT_CONNECTED") {
          setSheetsConnected(false);
          setHeadersError(t("sheets.reconnect" as TKey));
        } else if (data.error === "INVALID_SHEET_URL") {
          setHeadersError(t("sheets.invalidUrl" as TKey));
        } else if (data.error === "PERMISSION_DENIED") {
          setHeadersError(t("sheets.permissionDenied" as TKey));
        } else if (data.error === "SHEET_NOT_FOUND") {
          setHeadersError(t("sheets.notFound" as TKey));
        } else {
          setHeadersError(data.error || t("sheets.genericError" as TKey));
        }
        return;
      }
      const sid = data.spreadsheetId as string;
      const tabsList = data.tabs as SheetTab[];
      const activeTabName = data.activeTab.title as string;
      const hdrs = data.headers as HeaderEntry[];

      setSpreadsheetId(sid);
      setTabs(tabsList);
      setActiveTab(activeTabName);
      setHeaders(hdrs);

      // Try stored mapping first, fallback to auto-detect
      const stored = loadStoredMappings()[sid];
      if (stored && stored.tabName === activeTabName) {
        setMapping(stored.mapping);
      } else {
        setMapping(autoDetectMapping(hdrs));
      }
    } catch {
      setHeadersError(t("sheets.genericError" as TKey));
    } finally {
      setHeadersLoading(false);
    }
  }

  function changeTab(name: string) {
    setActiveTab(name);
    void loadHeaders(name);
  }

  /* ── Load rows using mapping ─────────────────────────────────── */
  async function loadRows() {
    if (!spreadsheetId || !activeTab) return;
    if (!mapping.titleCol && mapping.captionCols.length === 0 && !mapping.dropboxCol) {
      setRowsError(t("compose.mappingIncomplete" as TKey));
      return;
    }
    // Persist before fetching so subsequent visits remember
    saveStoredMapping(spreadsheetId, { tabName: activeTab, mapping });

    setRowsLoading(true);
    setRowsError(null);
    try {
      const r = await fetch("/api/google-sheets/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetUrl: sheetUrl.trim(),
          tabName: activeTab,
          mapping,
          limit: 300,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setRowsError(data.error || t("sheets.genericError" as TKey));
        return;
      }
      setRows(data.rows as MappedRow[]);
    } catch {
      setRowsError(t("sheets.genericError" as TKey));
    } finally {
      setRowsLoading(false);
    }
  }

  /* ── Click row → fetch Dropbox + polish caption ──────────────── */
  async function openRow(row: MappedRow) {
    setSelectedRow(row);
    setFiles(null);
    setFilesError(null);
    setSelectedFileIds(new Set());
    setCaption(row.caption);
    setPolishError(null);
    setPublishStatus({ phase: "idle" });

    if (row.dropboxUrl) void loadFolderFiles(row.dropboxUrl);
    else setFilesError(t("compose.noDropbox" as TKey));

    if (row.caption.trim()) void polishCaption(row);
  }

  async function loadFolderFiles(sharedUrl: string) {
    if (!dropboxConnected) {
      setFilesError(t("compose.dropboxNeeded" as TKey));
      return;
    }
    if (!isDropboxFolder(sharedUrl)) {
      setFilesError(t("compose.invalidDropbox" as TKey));
      return;
    }
    setFilesLoading(true);
    setFilesError(null);
    try {
      const r = await fetch("/api/dropbox/list-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedUrl }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.error === "DROPBOX_NOT_CONNECTED") {
          setDropboxConnected(false);
          setFilesError(t("compose.dropboxNeeded" as TKey));
        } else if (data.error === "FOLDER_NOT_FOUND") {
          setFilesError(t("compose.folderNotFound" as TKey));
        } else if (data.error === "INVALID_URL") {
          setFilesError(t("compose.invalidDropbox" as TKey));
        } else {
          setFilesError(data.error || t("compose.dropboxError" as TKey));
        }
        return;
      }
      const list = data.files as DropboxFileEntry[];
      setFiles(list);
      // Auto-select the first image so the buttons aren't immediately disabled.
      // User can deselect or pick others freely.
      const firstImage = list.find((f) => f.kind === "image");
      if (firstImage) {
        setSelectedFileIds(new Set([firstImage.id]));
      }
    } catch {
      setFilesError(t("compose.dropboxError" as TKey));
    } finally {
      setFilesLoading(false);
    }
  }

  async function polishCaption(row: MappedRow) {
    if (!row.caption.trim()) return;
    setPolishLoading(true);
    setPolishError(null);
    try {
      const r = await fetch("/api/social/caption-polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed: row.caption,
          name: row.title,
          category: row.subtitle,
          language: "zh",
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setPolishError(data.error || t("compose.captionError" as TKey));
        setCaption(row.caption);
        return;
      }
      setCaption(data.caption || row.caption);
    } catch {
      setPolishError(t("compose.captionError" as TKey));
      setCaption(row.caption);
    } finally {
      setPolishLoading(false);
    }
  }

  function toggleFile(id: string) {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 10) next.add(id);
      return next;
    });
  }

  /**
   * Transcode a Dropbox file (any format) into a public JPEG/MP4 URL
   * that Meta's IG media-create endpoint will accept. Returns null on
   * failure (caller surfaces the error to the user).
   */
  async function transcodeFile(file: DropboxFileEntry): Promise<string | null> {
    const r = await fetch("/api/dropbox/transcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sharedUrl: file.sharedUrl,
        path: file.pathDisplay,
        kind: file.kind,
        filename: file.name,
      }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      console.error("[transcode]", data);
      return null;
    }
    const data = (await r.json()) as { url?: string };
    return data.url ?? null;
  }

  /**
   * Transcode all selected files in parallel, return the list of public
   * fal URLs in the same order. Logs and skips any that fail. Returns
   * an empty array if everything failed.
   */
  async function transcodeAllSelected(): Promise<{
    urls: string[];
    hasVideo: boolean;
  }> {
    const chosen = (files ?? []).filter((f) => selectedFileIds.has(f.id));
    const results = await Promise.all(chosen.map((f) => transcodeFile(f)));
    const urls: string[] = [];
    let hasVideo = false;
    chosen.forEach((file, i) => {
      const u = results[i];
      if (!u) return;
      urls.push(u);
      if (file.kind === "video") hasVideo = true;
    });
    return { urls, hasVideo };
  }

  async function addToSchedule() {
    if (!selectedRow) return;
    if (selectedFileIds.size === 0) {
      setPublishStatus({ phase: "error", message: t("compose.selectImage" as TKey) });
      return;
    }
    setPublishStatus({ phase: "scheduling" });
    const { urls, hasVideo } = await transcodeAllSelected();
    if (urls.length === 0) {
      setPublishStatus({ phase: "error", message: t("compose.transcodeError" as TKey) });
      return;
    }
    // IG carousels are images-only. If any selected file was a video,
    // schedule a single video post for the first video instead of mixing.
    // For images-only selection, build one carousel post.
    const tz = userTimezone();
    const draft: CalendarPost = {
      id: crypto.randomUUID(),
      date: scheduleDate,
      time: scheduleTime,
      timezone: tz,
      mediaUrl: urls[0],
      mediaType: hasVideo ? "video" : "image",
      carouselUrls: !hasVideo && urls.length > 1 ? urls.slice(1) : undefined,
      caption,
      platform: "instagram",
      publishedPostId: null,
      presetId: null,
      presetLabel: null,
      status: "draft",
    };
    appendToCalendar(draft);
    setPublishStatus({ phase: "scheduled" });
  }

  async function publishNow() {
    if (!selectedRow) return;
    if (selectedFileIds.size === 0) {
      setPublishStatus({ phase: "error", message: t("compose.selectImage" as TKey) });
      return;
    }
    setPublishStatus({ phase: "publishing" });
    const { urls, hasVideo } = await transcodeAllSelected();
    if (urls.length === 0) {
      setPublishStatus({ phase: "error", message: t("compose.transcodeError" as TKey) });
      return;
    }
    try {
      const r = await fetch("/api/instagram/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrl: urls[0],
          mediaType: hasVideo ? "video" : "image",
          caption,
          // Carousels are image-only. If user mixed image + video,
          // we publish just the first item; UI surfaces this below.
          carouselUrls:
            !hasVideo && urls.length > 1 ? urls.slice(1) : undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setPublishStatus({ phase: "error", message: data.error || t("compose.publishError" as TKey) });
        return;
      }
      setPublishStatus({ phase: "published", id: data.postId });
    } catch {
      setPublishStatus({ phase: "error", message: t("compose.publishError" as TKey) });
    }
  }

  /* ── Render ──────────────────────────────────────────────────── */

  const both = sheetsConnected === true && dropboxConnected === true;
  const hasHeaders = headers.length > 0;

  return (
    <div className="space-y-5">
      {/* Header / connections strip */}
      <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold">{t("compose.title" as TKey)}</h2>
            <p className="text-xs text-muted mt-0.5">{t("compose.sub" as TKey)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ConnectionPill
            kind="sheets"
            connected={sheetsConnected}
            connectHref="/api/auth/google-sheets"
            label={t("compose.connectSheets" as TKey)}
            connectedLabel={t("compose.sheetsConnected" as TKey)}
          />
          <ConnectionPill
            kind="dropbox"
            connected={dropboxConnected}
            connectHref="/api/auth/dropbox"
            label={t("compose.connectDropbox" as TKey)}
            connectedLabel={t("compose.dropboxConnected" as TKey)}
          />
        </div>

        {both && (
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-background border border-border">
              <Link2 className="w-3.5 h-3.5 text-muted shrink-0" />
              <input
                type="url"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder={t("sheets.urlPlaceholder" as TKey)}
                className="flex-1 bg-transparent outline-none text-xs"
              />
              {sheetUrl && (
                <button
                  onClick={() => setSheetUrl("")}
                  className="text-muted hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => loadHeaders()}
              disabled={headersLoading || !sheetUrl.trim()}
              className="px-4 py-2 rounded-xl bg-foreground text-background text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
            >
              {headersLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {headersLoading ? t("sheets.loading" as TKey) : t("compose.loadHeaders" as TKey)}
            </button>
          </div>
        )}

        {headersError && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">
            {headersError}
          </p>
        )}
      </div>

      {/* Tab selector */}
      {hasHeaders && tabs.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase text-muted">
            {t("compose.tab" as TKey)}
          </span>
          {tabs.map((tab) => (
            <button
              key={tab.sheetId}
              onClick={() => changeTab(tab.title)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                tab.title === activeTab
                  ? "bg-foreground text-background"
                  : "bg-card border border-border hover:border-foreground/40"
              }`}
            >
              {tab.title}
            </button>
          ))}
        </div>
      )}

      {/* Column mapper */}
      {hasHeaders && (
        <SheetColumnMapper
          headers={headers}
          mapping={mapping}
          onChange={setMapping}
          onAutoDetect={() => setMapping(autoDetectMapping(headers))}
          labels={{
            title: t("mapper.title" as TKey),
            titleSub: t("mapper.sub" as TKey),
            autoDetect: t("mapper.autoDetect" as TKey),
            titleCol: t("mapper.titleCol" as TKey),
            subtitleCols: t("mapper.subtitleCols" as TKey),
            captionCols: t("mapper.captionCols" as TKey),
            dropboxCol: t("mapper.dropboxCol" as TKey),
            none: t("mapper.none" as TKey),
            addCol: t("mapper.addCol" as TKey),
          }}
        />
      )}

      {/* Load rows button */}
      {hasHeaders && (
        <div className="flex items-center gap-2">
          <button
            onClick={loadRows}
            disabled={rowsLoading}
            className="px-4 py-2 rounded-xl bg-foreground text-background text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
          >
            {rowsLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {rowsLoading ? t("sheets.loading" as TKey) : t("compose.loadRows" as TKey)}
          </button>
          {rows && (
            <span className="text-[11px] text-muted">
              {t("sheets.rowsHeader" as TKey).replace("{n}", String(rows.length))}
            </span>
          )}
        </div>
      )}

      {rowsError && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">
          {rowsError}
        </p>
      )}

      {/* Card grid */}
      {rows && rows.length === 0 && (
        <p className="text-xs text-muted px-3 py-8 text-center">
          {t("compose.emptyRows" as TKey)}
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {rows.map((row) => (
            <RowCard
              key={row.rowIndex}
              row={row}
              active={selectedRow?.rowIndex === row.rowIndex}
              onClick={() => openRow(row)}
            />
          ))}
        </div>
      )}

      {/* Composer drawer */}
      {selectedRow && (
        <ComposerDrawer
          row={selectedRow}
          files={files}
          filesLoading={filesLoading}
          filesError={filesError}
          selectedFileIds={selectedFileIds}
          onToggleFile={toggleFile}
          caption={caption}
          onCaptionChange={setCaption}
          polishLoading={polishLoading}
          polishError={polishError}
          onRepolish={() => polishCaption(selectedRow)}
          scheduleDate={scheduleDate}
          onScheduleDateChange={setScheduleDate}
          scheduleTime={scheduleTime}
          onScheduleTimeChange={setScheduleTime}
          publishStatus={publishStatus}
          onAddToSchedule={addToSchedule}
          onPublishNow={publishNow}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function ConnectionPill({
  kind,
  connected,
  connectHref,
  label,
  connectedLabel,
}: {
  kind: "sheets" | "dropbox";
  connected: boolean | null;
  connectHref: string;
  label: string;
  connectedLabel: string;
}) {
  const Icon = kind === "sheets" ? Table2 : Box;
  if (connected === null) {
    return (
      <div className="px-3 py-1.5 rounded-full bg-background border border-border text-xs text-muted flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" />
        …
      </div>
    );
  }
  if (connected) {
    return (
      <div className="px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 text-xs font-medium text-green-700 dark:text-green-400 flex items-center gap-1.5">
        <Icon className="w-3 h-3" />
        <Check className="w-3 h-3" />
        {connectedLabel}
      </div>
    );
  }
  return (
    <a
      href={connectHref}
      className="px-3 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold flex items-center gap-1.5 hover:opacity-90"
    >
      <Icon className="w-3 h-3" />
      {label}
    </a>
  );
}

function RowCard({
  row,
  active,
  onClick,
}: {
  row: MappedRow;
  active: boolean;
  onClick: () => void;
}) {
  const excerpt = row.caption.slice(0, 80);
  const hasDropbox = isDropboxFolder(row.dropboxUrl);
  return (
    <button
      onClick={onClick}
      className={`text-left p-3 rounded-xl border transition-all ${
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-card border-border hover:border-foreground/40"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <span className={`text-[10px] font-mono ${active ? "opacity-60" : "text-muted"}`}>
          #{row.rowIndex}
        </span>
        {row.subtitle && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              active ? "bg-background/10" : "bg-muted/10"
            }`}
          >
            {row.subtitle}
          </span>
        )}
        {hasDropbox && (
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded ${
              active ? "bg-background/10 opacity-80" : "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
            }`}
            title="Has Dropbox folder"
          >
            📁
          </span>
        )}
      </div>
      <p className="text-sm font-semibold leading-tight line-clamp-2 break-words">
        {row.title || "—"}
      </p>
      {excerpt && (
        <p
          className={`text-[11px] mt-2 line-clamp-3 whitespace-pre-line ${
            active ? "opacity-70" : "text-foreground/70"
          }`}
        >
          {excerpt}
        </p>
      )}
    </button>
  );
}

interface ComposerDrawerProps {
  row: MappedRow;
  files: DropboxFileEntry[] | null;
  filesLoading: boolean;
  filesError: string | null;
  selectedFileIds: Set<string>;
  onToggleFile: (id: string) => void;
  caption: string;
  onCaptionChange: (s: string) => void;
  polishLoading: boolean;
  polishError: string | null;
  onRepolish: () => void;
  scheduleDate: string;
  onScheduleDateChange: (s: string) => void;
  scheduleTime: string;
  onScheduleTimeChange: (s: string) => void;
  publishStatus:
    | { phase: "idle" }
    | { phase: "scheduling" }
    | { phase: "publishing" }
    | { phase: "scheduled" | "published"; id?: string }
    | { phase: "error"; message: string };
  onAddToSchedule: () => void;
  onPublishNow: () => void;
  onClose: () => void;
}

function ComposerDrawer(props: ComposerDrawerProps) {
  const { t } = useI18n();
  const {
    row,
    files,
    filesLoading,
    filesError,
    selectedFileIds,
    onToggleFile,
    caption,
    onCaptionChange,
    polishLoading,
    polishError,
    onRepolish,
    scheduleDate,
    onScheduleDateChange,
    scheduleTime,
    onScheduleTimeChange,
    publishStatus,
    onAddToSchedule,
    onPublishNow,
    onClose,
  } = props;
  const phase = publishStatus.phase;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-stretch justify-end overscroll-contain">
      <div className="absolute inset-0" onClick={onClose} aria-label="close composer" />
      <div className="relative w-full max-w-lg h-full bg-background border-l border-border overflow-y-auto">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-5 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {row.subtitle && (
              <p className="text-xs text-muted">{row.subtitle} · #{row.rowIndex}</p>
            )}
            <h3 className="text-base font-semibold truncate">{row.title || "—"}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-card text-muted hover:text-foreground"
            aria-label="close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Image picker */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t("compose.pickMedia" as TKey)}
              </p>
              {files && (
                <span className="text-[10px] text-muted">
                  {selectedFileIds.size}/{Math.min(10, files.length)} · {files.length}{" "}
                  {t("compose.filesInFolder" as TKey)}
                </span>
              )}
            </div>
            {filesLoading && (
              <div className="flex items-center gap-2 text-xs text-muted px-2 py-4">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t("compose.loadingDropbox" as TKey)}
              </div>
            )}
            {filesError && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {filesError}
              </p>
            )}
            {files && files.length === 0 && !filesError && (
              <p className="text-xs text-muted px-3 py-4 text-center bg-card rounded-lg">
                {t("compose.emptyFolder" as TKey)}
              </p>
            )}
            {files && files.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {files.map((file) => {
                  const isSel = selectedFileIds.has(file.id);
                  return (
                    <button
                      key={file.id}
                      onClick={() => onToggleFile(file.id)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        isSel ? "border-foreground" : "border-transparent hover:border-foreground/30"
                      }`}
                      title={file.name}
                    >
                      {file.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={file.displayUrl}
                          alt={file.name}
                          className="w-full h-full object-cover bg-card"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-card text-muted text-[10px]">
                          🎬 {file.name}
                        </div>
                      )}
                      {isSel && (
                        <div className="absolute inset-0 bg-foreground/30 flex items-start justify-end p-1">
                          <span className="w-5 h-5 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center">
                            ✓
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Caption */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t("compose.caption" as TKey)}
              </p>
              <button
                onClick={onRepolish}
                disabled={polishLoading || !row.caption.trim()}
                className="text-[11px] text-foreground hover:underline disabled:opacity-50 flex items-center gap-1"
              >
                {polishLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {t("compose.repolish" as TKey)}
              </button>
            </div>
            <textarea
              value={caption}
              onChange={(e) => onCaptionChange(e.target.value)}
              rows={8}
              placeholder={t("compose.captionPlaceholder" as TKey)}
              className="w-full px-3 py-2 rounded-lg bg-card border border-border text-xs leading-relaxed font-mono resize-y outline-none focus:border-foreground/50"
            />
            {polishError && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">{polishError}</p>
            )}
            {row.caption && (
              <details className="text-[11px] text-muted">
                <summary className="cursor-pointer hover:text-foreground">
                  {t("compose.viewSeed" as TKey)}
                </summary>
                <p className="mt-2 p-2 rounded bg-card whitespace-pre-wrap">{row.caption}</p>
              </details>
            )}
          </section>

          {/* Schedule */}
          <section className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t("compose.schedule" as TKey)}
            </p>
            <div className="flex gap-2">
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => onScheduleDateChange(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-card border border-border text-xs"
              />
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => onScheduleTimeChange(e.target.value)}
                className="w-28 px-3 py-2 rounded-lg bg-card border border-border text-xs font-mono"
              />
            </div>
          </section>

          {/* Actions */}
          <section className="space-y-2 pt-2 sticky bottom-0 bg-background py-3 border-t border-border">
            {phase === "scheduled" && (
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2 space-y-2">
                <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-2">
                  <Check className="w-3.5 h-3.5" />
                  {t("compose.scheduledOk" as TKey)}
                </p>
                <Link
                  href="/social"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 hover:underline"
                >
                  {t("compose.viewSchedule" as TKey)}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}
            {phase === "published" && (
              <p className="text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-3 py-2 rounded-lg flex items-center gap-2">
                <Check className="w-3.5 h-3.5" />
                {t("compose.publishedOk" as TKey)}
              </p>
            )}
            {phase === "error" && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">
                {publishStatus.message}
              </p>
            )}
            {selectedFileIds.size === 0 && phase !== "scheduled" && phase !== "published" && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {t("compose.selectImage" as TKey)}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={onAddToSchedule}
                disabled={
                  selectedFileIds.size === 0 ||
                  phase === "scheduling" ||
                  phase === "publishing" ||
                  phase === "scheduled"
                }
                className="flex-1 px-4 py-2.5 rounded-xl bg-card border border-border text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 hover:bg-muted/10"
              >
                {phase === "scheduling" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CalendarPlus className="w-3.5 h-3.5" />
                )}
                {phase === "scheduling"
                  ? t("compose.scheduling" as TKey)
                  : t("compose.addToSchedule" as TKey)}
              </button>
              <button
                onClick={onPublishNow}
                disabled={
                  selectedFileIds.size === 0 ||
                  phase === "scheduling" ||
                  phase === "publishing"
                }
                className="flex-1 px-4 py-2.5 rounded-xl bg-foreground text-background text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {phase === "publishing" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                {phase === "publishing"
                  ? t("compose.publishing" as TKey)
                  : t("compose.publishNow" as TKey)}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
