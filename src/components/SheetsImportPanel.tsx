"use client";

import { useEffect, useState } from "react";
import { Table2, Link2, RefreshCw, Loader2, X } from "lucide-react";

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

interface SheetsImportPanelProps {
  /** Localized strings — pass through useI18n() in the parent */
  strings: {
    title: string; // e.g. "從 Google Sheet 導入"
    sub: string; // e.g. "讀取「客人同意露出 = v」且尚未發 IG 的列"
    connectCta: string; // "連結 Google Sheets"
    disconnect: string; // "解除連結"
    urlPlaceholder: string; // "貼上 Google Sheet 連結"
    preview: string; // "預覽列"
    loading: string; // "讀取中…"
    noRows: string; // "沒有符合條件的列"
    invalidUrl: string; // "Sheet 連結格式不正確"
    permissionDenied: string; // "無權讀取此 Sheet — 請確認該 Sheet 你有檢視權限"
    notFound: string; // "找不到 Sheet"
    reconnect: string; // "授權已過期，請重新連結"
    genericError: string; // "讀取失敗，請重試"
    rowsHeader: (n: number) => string; // "X 列可導入"
  };
}

export default function SheetsImportPanel({ strings: s }: SheetsImportPanelProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [sheetUrl, setSheetUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ce:lastSheetUrl") || "";
  });
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SheetRowPreview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Status on mount + react to OAuth callback redirect (?sheets_connected=1)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/google-sheets/status");
        const data = await r.json();
        if (!cancelled) setConnected(Boolean(data.connected));
      } catch {
        if (!cancelled) setConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("sheets_connected") === "1") {
      setConnected(true);
      // Clean the param so refresh doesn't keep showing the banner
      const url = new URL(window.location.href);
      url.searchParams.delete("sheets_connected");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  function handleConnect() {
    window.location.href = "/api/auth/google-sheets";
  }

  async function handleDisconnect() {
    await fetch("/api/google-sheets/disconnect", { method: "POST" });
    setConnected(false);
    setRows(null);
  }

  async function handlePreview() {
    if (!sheetUrl.trim()) {
      setError(s.invalidUrl);
      return;
    }
    setLoading(true);
    setError(null);
    setRows(null);
    try {
      localStorage.setItem("ce:lastSheetUrl", sheetUrl.trim());
      const r = await fetch("/api/google-sheets/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: sheetUrl.trim(), limit: 50 }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.error === "SHEETS_NOT_CONNECTED") {
          setConnected(false);
          setError(s.reconnect);
        } else if (data.error === "INVALID_SHEET_URL") {
          setError(s.invalidUrl);
        } else if (data.error === "PERMISSION_DENIED") {
          setError(s.permissionDenied);
        } else if (data.error === "SHEET_NOT_FOUND") {
          setError(s.notFound);
        } else {
          setError(data.error || s.genericError);
        }
        return;
      }
      setRows(data.rows as SheetRowPreview[]);
    } catch {
      setError(s.genericError);
    } finally {
      setLoading(false);
    }
  }

  if (connected === null) {
    // Still loading status — render nothing to avoid flicker
    return null;
  }

  return (
    <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
          <Table2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{s.title}</p>
          <p className="text-xs text-muted mt-0.5">{s.sub}</p>
        </div>
        {connected && (
          <button
            onClick={handleDisconnect}
            className="text-[11px] text-muted hover:text-foreground underline shrink-0"
          >
            {s.disconnect}
          </button>
        )}
      </div>

      {!connected && (
        <button
          onClick={handleConnect}
          className="w-full px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 flex items-center justify-center gap-2"
        >
          <Link2 className="w-4 h-4" />
          {s.connectCta}
        </button>
      )}

      {connected && (
        <>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-background border border-border">
              <Link2 className="w-3.5 h-3.5 text-muted shrink-0" />
              <input
                type="url"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder={s.urlPlaceholder}
                className="flex-1 bg-transparent outline-none text-xs"
              />
              {sheetUrl && (
                <button
                  onClick={() => setSheetUrl("")}
                  className="text-muted hover:text-foreground"
                  aria-label="clear"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={handlePreview}
              disabled={loading || !sheetUrl.trim()}
              className="px-4 py-2 rounded-xl bg-foreground text-background text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {loading ? s.loading : s.preview}
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          {rows && rows.length === 0 && (
            <p className="text-xs text-muted px-3 py-2">{s.noRows}</p>
          )}

          {rows && rows.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wide px-1">
                {s.rowsHeader(rows.length)}
              </p>
              <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
                {rows.map((row) => (
                  <div
                    key={row.rowIndex}
                    className="px-3 py-2 rounded-lg bg-background border border-border text-xs"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-muted shrink-0">
                        #{row.rowIndex}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-muted/10 text-[10px] shrink-0">
                        {row.category || "—"}
                      </span>
                      <span className="font-semibold truncate">{row.name || "—"}</span>
                    </div>
                    {row.mainStone && (
                      <p className="text-muted mt-1">主石：{row.mainStone}</p>
                    )}
                    {row.relatedInfo && (
                      <p className="text-foreground/80 mt-1 line-clamp-2">
                        {row.relatedInfo}
                      </p>
                    )}
                    {row.dropboxUrl && (
                      <p className="text-[10px] text-muted mt-1 truncate">
                        📁 {row.dropboxUrl}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
