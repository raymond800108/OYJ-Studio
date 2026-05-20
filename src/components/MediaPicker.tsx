"use client";

import { useEffect, useRef, useState } from "react";
import { X, Upload, Clock, Loader2, Image as ImageIcon, Film, AlertCircle } from "lucide-react";
import type { HistoryItem } from "@/components/HistoryPanel";
import { useI18n, type TKey } from "@/lib/i18n";

export interface PickedMedia {
  url: string;
  kind: "image" | "video";
  source: "history" | "upload";
}

interface MediaPickerProps {
  open: boolean;
  /** When true the user can tick multiple items and submit them all at once. */
  multi?: boolean;
  /** Pre-selected URLs (so re-opening shows current state). */
  selectedUrls?: string[];
  onClose: () => void;
  onConfirm: (picks: PickedMedia[]) => void;
}

/* ─── helpers ────────────────────────────────────────────────────── */

function readHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("convra-history") || "[]";
    return JSON.parse(raw) as HistoryItem[];
  } catch {
    return [];
  }
}

function historyKind(item: HistoryItem): "image" | "video" {
  return item.mode === "video" ? "video" : "image";
}

/* ─── Component ──────────────────────────────────────────────────── */

export default function MediaPicker({
  open,
  multi = true,
  selectedUrls = [],
  onClose,
  onConfirm,
}: MediaPickerProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"history" | "upload">("history");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set(selectedUrls));
  // url → { kind, source } so we can rebuild PickedMedia on confirm
  const [meta, setMeta] = useState<Record<string, { kind: "image" | "video"; source: "history" | "upload" }>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Reset local state only on the open transition (false → true).
  // The parent passes `selectedUrls={extraSlides.map(s => s.url)}`, which
  // is a brand-new array every render — including the render triggered
  // by our own setPicked. If we keyed this effect on selectedUrls we'd
  // wipe the user's selection back to the prop value on every click.
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setHistory(readHistory());
      setPicked(new Set(selectedUrls));
      setMeta({});
      setUploadError(null);
    }
    prevOpenRef.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function toggle(url: string, kind: "image" | "video", source: "history" | "upload") {
    setMeta((m) => ({ ...m, [url]: { kind, source } }));
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
        return next;
      }
      if (!multi) {
        return new Set([url]);
      }
      next.add(url);
      return next;
    });
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setUploadError(data.error || t("mediaPicker.uploadFailed" as TKey));
        return;
      }
      const kind: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
      // Auto-select the just-uploaded file
      setMeta((m) => ({ ...m, [data.url]: { kind, source: "upload" } }));
      setPicked((prev) => (multi ? new Set([...prev, data.url]) : new Set([data.url])));
    } catch {
      setUploadError(t("mediaPicker.uploadFailed" as TKey));
    } finally {
      setUploading(false);
    }
  }

  function confirm() {
    const items: PickedMedia[] = [];
    picked.forEach((url) => {
      const m = meta[url];
      if (m) items.push({ url, kind: m.kind, source: m.source });
    });
    onConfirm(items);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-background border border-border rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <h3 className="text-sm font-semibold flex-1">{t("mediaPicker.title" as TKey)}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-card text-muted hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 flex gap-1">
          <TabButton
            active={tab === "history"}
            icon={<Clock className="w-3.5 h-3.5" />}
            label={t("mediaPicker.tabHistory" as TKey)}
            count={history.length}
            onClick={() => setTab("history")}
          />
          <TabButton
            active={tab === "upload"}
            icon={<Upload className="w-3.5 h-3.5" />}
            label={t("mediaPicker.tabUpload" as TKey)}
            onClick={() => setTab("upload")}
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "history" && (
            <>
              {history.length === 0 ? (
                <p className="text-xs text-muted text-center py-12">
                  {t("mediaPicker.historyEmpty" as TKey)}
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {history.map((item) => {
                    const url = item.resultUrl;
                    const kind = historyKind(item);
                    const isSel = picked.has(url);
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggle(url, kind, "history")}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          isSel ? "border-foreground" : "border-transparent hover:border-foreground/30"
                        }`}
                        title={item.settings?.prompt?.slice(0, 60) || `Item ${item.id.slice(0, 6)}`}
                      >
                        {kind === "video" ? (
                          <>
                            <video
                              src={url}
                              className="w-full h-full object-cover bg-black"
                              muted
                              playsInline
                              preload="metadata"
                            />
                            <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1 py-0.5 rounded flex items-center gap-0.5">
                              <Film className="w-2.5 h-2.5" />
                              video
                            </span>
                          </>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="" className="w-full h-full object-cover bg-card" loading="lazy" />
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
            </>
          )}

          {tab === "upload" && (
            <div className="space-y-3">
              <button
                onClick={() => uploadInputRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-border rounded-xl py-12 hover:border-foreground/40 flex flex-col items-center gap-2 disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-muted" />
                ) : (
                  <Upload className="w-6 h-6 text-muted" />
                )}
                <span className="text-xs text-muted">
                  {uploading
                    ? t("mediaPicker.uploading" as TKey)
                    : t("mediaPicker.uploadHint" as TKey)}
                </span>
              </button>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                  e.target.value = ""; // allow re-picking same file
                }}
              />
              {uploadError && (
                <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {uploadError}
                </p>
              )}
              {/* Show uploaded files (which are also in `picked`) */}
              {Object.entries(meta).filter(([, m]) => m.source === "upload").length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase text-muted mb-2">
                    {t("mediaPicker.justUploaded" as TKey)}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(meta)
                      .filter(([, m]) => m.source === "upload")
                      .map(([url, m]) => {
                        const isSel = picked.has(url);
                        return (
                          <button
                            key={url}
                            onClick={() => toggle(url, m.kind, "upload")}
                            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                              isSel ? "border-foreground" : "border-transparent hover:border-foreground/30"
                            }`}
                          >
                            {m.kind === "video" ? (
                              <video src={url} className="w-full h-full object-cover bg-black" muted playsInline preload="metadata" />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={url} alt="" className="w-full h-full object-cover bg-card" />
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
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center gap-3">
          <span className="text-[11px] text-muted flex-1 flex items-center gap-1">
            <ImageIcon className="w-3 h-3" />
            {picked.size} {t("mediaPicker.selected" as TKey)}
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs hover:bg-card"
          >
            {t("mediaPicker.cancel" as TKey)}
          </button>
          <button
            onClick={confirm}
            disabled={picked.size === 0}
            className="px-4 py-1.5 rounded-lg bg-foreground text-background text-xs font-semibold disabled:opacity-50"
          >
            {t("mediaPicker.confirm" as TKey)}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-t-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
        active
          ? "bg-card border border-border border-b-0 text-foreground"
          : "text-muted hover:text-foreground"
      }`}
    >
      {icon}
      {label}
      {typeof count === "number" && count > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${active ? "bg-muted/30" : "bg-muted/20"}`}>
          {count}
        </span>
      )}
    </button>
  );
}
