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
} from "lucide-react";
import { useI18n, type TKey } from "@/lib/i18n";

/* ─── Types mirroring server responses ───────────────────────────── */

interface SheetRowPreview {
  rowIndex: number;
  category: string;
  name: string;
  mainStone: string;
  stoneSpec: string;
  relatedInfo: string;
  dropboxUrl: string;
  notes: string;
  approved: boolean;
  approvedRaw: string;
  postedInstagram: string;
  postedFacebook: string;
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
  caption: string;
  platform: string | null;
  publishedPostId: string | null;
  presetId: string | null;
  presetLabel: string | null;
  status: "draft" | "scheduled" | "published" | "failed";
}

/* ─── helpers ────────────────────────────────────────────────────── */

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

/* ─── Component ──────────────────────────────────────────────────── */

export default function ComposeWorkbench() {
  const { t } = useI18n();

  // Connection state
  const [sheetsConnected, setSheetsConnected] = useState<boolean | null>(null);
  const [dropboxConnected, setDropboxConnected] = useState<boolean | null>(null);

  // Sheet
  const [sheetUrl, setSheetUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ce:lastSheetUrl") || "";
  });
  const [sheetLoading, setSheetLoading] = useState(false);
  const [rows, setRows] = useState<SheetRowPreview[] | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [onlyApproved, setOnlyApproved] = useState(true);
  const [onlyUnposted, setOnlyUnposted] = useState(true);

  // Selected row + composer state
  const [selectedRow, setSelectedRow] = useState<SheetRowPreview | null>(null);
  const [files, setFiles] = useState<DropboxFileEntry[] | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

  // Caption
  const [caption, setCaption] = useState("");
  const [polishLoading, setPolishLoading] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);

  // Schedule input
  const [scheduleDate, setScheduleDate] = useState<string>(todayIso());
  const [scheduleTime, setScheduleTime] = useState<string>("12:00");

  // Publish state
  const [publishStatus, setPublishStatus] = useState<
    | { phase: "idle" }
    | { phase: "publishing" }
    | { phase: "scheduled" | "published"; id?: string }
    | { phase: "error"; message: string }
  >({ phase: "idle" });

  /* ── Initial: connection status + parse URL params ───────────── */
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

  /* ── Load Sheet rows ─────────────────────────────────────────── */
  async function loadSheet() {
    if (!sheetUrl.trim()) {
      setSheetError(t("sheets.invalidUrl" as TKey));
      return;
    }
    setSheetLoading(true);
    setSheetError(null);
    setRows(null);
    try {
      localStorage.setItem("ce:lastSheetUrl", sheetUrl.trim());
      const r = await fetch("/api/google-sheets/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetUrl: sheetUrl.trim(),
          limit: 200,
          onlyApproved,
          onlyUnposted,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.error === "SHEETS_NOT_CONNECTED") {
          setSheetsConnected(false);
          setSheetError(t("sheets.reconnect" as TKey));
        } else if (data.error === "INVALID_SHEET_URL") {
          setSheetError(t("sheets.invalidUrl" as TKey));
        } else if (data.error === "PERMISSION_DENIED") {
          setSheetError(t("sheets.permissionDenied" as TKey));
        } else if (data.error === "SHEET_NOT_FOUND") {
          setSheetError(t("sheets.notFound" as TKey));
        } else {
          setSheetError(data.error || t("sheets.genericError" as TKey));
        }
        return;
      }
      setRows(data.rows as SheetRowPreview[]);
    } catch {
      setSheetError(t("sheets.genericError" as TKey));
    } finally {
      setSheetLoading(false);
    }
  }

  /* ── Click a row → fetch Dropbox folder + polish caption ─────── */
  async function openRow(row: SheetRowPreview) {
    setSelectedRow(row);
    setFiles(null);
    setFilesError(null);
    setSelectedFileIds(new Set());
    setCaption("");
    setPolishError(null);
    setPublishStatus({ phase: "idle" });

    // Fire Dropbox folder list + caption polish in parallel
    void loadFolderFiles(row.dropboxUrl);
    void polishCaption(row);
  }

  async function loadFolderFiles(sharedUrl: string) {
    if (!sharedUrl) {
      setFilesError(t("compose.noDropbox" as TKey));
      return;
    }
    if (!dropboxConnected) {
      setFilesError(t("compose.dropboxNeeded" as TKey));
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
      setFiles(data.files as DropboxFileEntry[]);
    } catch {
      setFilesError(t("compose.dropboxError" as TKey));
    } finally {
      setFilesLoading(false);
    }
  }

  async function polishCaption(row: SheetRowPreview) {
    if (!row.relatedInfo.trim()) {
      setCaption("");
      return;
    }
    setPolishLoading(true);
    setPolishError(null);
    try {
      const r = await fetch("/api/social/caption-polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed: row.relatedInfo,
          name: row.name,
          category: row.category,
          mainStone: row.mainStone,
          language: "zh",
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setPolishError(data.error || t("compose.captionError" as TKey));
        // Still show the raw seed so user can edit
        setCaption(row.relatedInfo);
        return;
      }
      setCaption(data.caption || row.relatedInfo);
    } catch {
      setPolishError(t("compose.captionError" as TKey));
      setCaption(row.relatedInfo);
    } finally {
      setPolishLoading(false);
    }
  }

  function toggleFile(id: string) {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 10) next.add(id); // IG carousel cap = 10
      return next;
    });
  }

  /* ── Add the selected files + caption to the calendar ────────── */
  async function addToSchedule() {
    if (!selectedRow) return;
    if (selectedFileIds.size === 0) {
      setPublishStatus({ phase: "error", message: t("compose.selectImage" as TKey) });
      return;
    }
    const tz = userTimezone();
    const chosen = (files ?? []).filter((f) => selectedFileIds.has(f.id));
    // For now, one post per file; carousels can be a later improvement.
    for (const file of chosen) {
      appendToCalendar({
        id: crypto.randomUUID(),
        date: scheduleDate,
        time: scheduleTime,
        timezone: tz,
        mediaUrl: file.directUrl,
        mediaType: file.kind === "video" ? "video" : "image",
        caption,
        platform: "instagram",
        publishedPostId: null,
        presetId: null,
        presetLabel: null,
        status: "draft",
      });
    }
    setPublishStatus({ phase: "scheduled" });
  }

  /* ── Publish to Instagram right now (first selected image) ──── */
  async function publishNow() {
    if (!selectedRow) return;
    if (selectedFileIds.size === 0) {
      setPublishStatus({ phase: "error", message: t("compose.selectImage" as TKey) });
      return;
    }
    const chosen = (files ?? []).filter((f) => selectedFileIds.has(f.id));
    if (chosen.length === 0) return;

    setPublishStatus({ phase: "publishing" });
    // IG single-media POST — picks first selected. Carousel publishing
    // multi-image is a separate Graph flow we'll add later.
    const file = chosen[0];
    try {
      const r = await fetch("/api/instagram/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrl: file.directUrl,
          mediaType: file.kind === "video" ? "video" : "image",
          caption,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setPublishStatus({
          phase: "error",
          message: data.error || t("compose.publishError" as TKey),
        });
        return;
      }
      setPublishStatus({ phase: "published", id: data.postId });
    } catch {
      setPublishStatus({ phase: "error", message: t("compose.publishError" as TKey) });
    }
  }

  /* ── Render ──────────────────────────────────────────────────── */

  const both = sheetsConnected === true && dropboxConnected === true;

  return (
    <div className="space-y-5">
      {/* Header / connections strip */}
      <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              {t("compose.title" as TKey)}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {t("compose.sub" as TKey)}
            </p>
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
          <>
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
                onClick={loadSheet}
                disabled={sheetLoading || !sheetUrl.trim()}
                className="px-4 py-2 rounded-xl bg-foreground text-background text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
              >
                {sheetLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {sheetLoading ? t("sheets.loading" as TKey) : t("compose.loadRows" as TKey)}
              </button>
            </div>

            {/* Filter toggles */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-foreground/80">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyApproved}
                  onChange={(e) => setOnlyApproved(e.target.checked)}
                  className="accent-foreground"
                />
                <span>{t("compose.filterApproved" as TKey)}</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyUnposted}
                  onChange={(e) => setOnlyUnposted(e.target.checked)}
                  className="accent-foreground"
                />
                <span>{t("compose.filterUnposted" as TKey)}</span>
              </label>
              <span className="text-[11px] text-muted ml-auto">
                {t("compose.filterHint" as TKey)}
              </span>
            </div>
          </>
        )}

        {sheetError && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">
            {sheetError}
          </p>
        )}
      </div>

      {/* Card grid */}
      {rows && rows.length === 0 && (
        <p className="text-xs text-muted px-3 py-8 text-center">
          {t("sheets.noRows" as TKey)}
        </p>
      )}

      {rows && rows.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-3">
            {t("sheets.rowsHeader" as TKey).replace("{n}", String(rows.length))}
          </p>
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
  row: SheetRowPreview;
  active: boolean;
  onClick: () => void;
}) {
  const excerpt = row.relatedInfo.slice(0, 60);
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
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded ${
            active ? "bg-background/10" : "bg-muted/10"
          }`}
        >
          {row.category || "—"}
        </span>
        <span className={`text-[10px] font-mono ${active ? "opacity-60" : "text-muted"}`}>
          #{row.rowIndex}
        </span>
        {!row.approved && (
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
              active
                ? "bg-amber-300/30 text-amber-100"
                : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
            }`}
            title="Customer not yet approved for display"
          >
            未授權
          </span>
        )}
        {row.postedInstagram && (
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
              active
                ? "bg-green-300/30 text-green-100"
                : "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
            }`}
            title={`Already posted to IG (${row.postedInstagram})`}
          >
            ✓ IG
          </span>
        )}
      </div>
      <p className="text-sm font-semibold leading-tight truncate">{row.name || "—"}</p>
      {row.mainStone && (
        <p className={`text-[11px] mt-1 ${active ? "opacity-70" : "text-muted"}`}>
          {row.mainStone}
        </p>
      )}
      {excerpt && (
        <p
          className={`text-[11px] mt-2 line-clamp-2 ${
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
  row: SheetRowPreview;
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
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-label="close composer"
      />
      <div className="relative w-full max-w-lg h-full bg-background border-l border-border overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-5 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted">
              {row.category} · #{row.rowIndex}
            </p>
            <h3 className="text-base font-semibold truncate">{row.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-card text-muted hover:text-foreground"
            aria-label="close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          {/* Stone meta */}
          {(row.mainStone || row.stoneSpec) && (
            <div className="text-xs text-foreground/80 space-y-0.5">
              {row.mainStone && <p>主石：{row.mainStone}</p>}
              {row.stoneSpec && <p>規格：{row.stoneSpec}</p>}
            </div>
          )}

          {/* Image picker */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t("compose.pickMedia" as TKey)}
              </p>
              {files && (
                <span className="text-[10px] text-muted">
                  {selectedFileIds.size}/{Math.min(10, files.length)} ·{" "}
                  {files.length} {t("compose.filesInFolder" as TKey)}
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

          {/* Caption editor */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t("compose.caption" as TKey)}
              </p>
              <button
                onClick={onRepolish}
                disabled={polishLoading}
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
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                {polishError}
              </p>
            )}

            {row.relatedInfo && (
              <details className="text-[11px] text-muted">
                <summary className="cursor-pointer hover:text-foreground">
                  {t("compose.viewSeed" as TKey)}
                </summary>
                <p className="mt-2 p-2 rounded bg-card whitespace-pre-wrap">
                  {row.relatedInfo}
                </p>
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

          {/* Action row */}
          <section className="space-y-2 pt-2 sticky bottom-0 bg-background py-3 border-t border-border">
            {phase === "scheduled" && (
              <p className="text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-3 py-2 rounded-lg flex items-center gap-2">
                <Check className="w-3.5 h-3.5" />
                {t("compose.scheduledOk" as TKey)}
              </p>
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

            <div className="flex gap-2">
              <button
                onClick={onAddToSchedule}
                disabled={
                  selectedFileIds.size === 0 ||
                  phase === "publishing" ||
                  phase === "scheduled"
                }
                className="flex-1 px-4 py-2.5 rounded-xl bg-card border border-border text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 hover:bg-muted/10"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                {t("compose.addToSchedule" as TKey)}
              </button>
              <button
                onClick={onPublishNow}
                disabled={selectedFileIds.size === 0 || phase === "publishing"}
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

