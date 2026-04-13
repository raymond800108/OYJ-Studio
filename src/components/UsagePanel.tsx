"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Trash2,
  TrendingUp,
  DollarSign,
  Zap,
  Activity,
  Server,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  RefreshCw,
  Cloud,
  HardDrive,
  Users,
  User,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import type { UsageEntry, UsageSummary, ApiService, ApiAction } from "@/lib/usage";

interface UsagePanelProps {
  entries: UsageEntry[];
  summary: UsageSummary;
  onClear: () => void;
  kvAvailable: boolean | null;
  onRefresh: () => void;
  userEmail?: string | null;
  viewMode?: "self" | "all" | string;
  onViewModeChange?: (v: "self" | "all" | string) => void;
}

/* ─── Service display config ───────────────────────────────────── */

const SERVICE_COLORS: Record<ApiService, string> = {
  fal: "bg-purple-100 text-purple-700 border-purple-200",
  kie: "bg-blue-100 text-blue-700 border-blue-200",
  meshy: "bg-emerald-100 text-emerald-700 border-emerald-200",
  openai: "bg-amber-100 text-amber-700 border-amber-200",
};

const SERVICE_LABELS: Record<ApiService, string> = {
  fal: "fal.ai",
  kie: "Kie.ai",
  meshy: "Meshy",
  openai: "OpenAI",
};

const ACTION_LABELS: Record<ApiAction, { en: string; zh: string }> = {
  "camera-generate": { en: "Camera Angle", zh: "相機角度" },
  "inpaint": { en: "Inpaint / Edit", zh: "局部編輯" },
  "upload": { en: "File Upload", zh: "檔案上傳" },
  "image-generate": { en: "Image Generation", zh: "圖片生成" },
  "video-generate": { en: "Video Generation", zh: "影片生成" },
  "3d-generate": { en: "3D Model", zh: "3D 模型" },
  "analyze-jewelry": { en: "Jewelry Analysis", zh: "珠寶分析" },
  "analyze-character": { en: "Character Analysis", zh: "角色分析" },
  "analyze-outfit": { en: "Outfit Analysis", zh: "服裝分析" },
  "relight": { en: "Relighting", zh: "燈光調整" },
  "estimate": { en: "Price Estimate", zh: "價格估算" },
};

/* ─── Helpers ──────────────────────────────────────────────────── */

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(ts: number, lang: string): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return lang === "zh" ? "剛剛" : "just now";
  if (mins < 60) return lang === "zh" ? `${mins} 分鐘前` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === "zh" ? `${hrs} 小時前` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return lang === "zh" ? `${days} 天前` : `${days}d ago`;
}

/* ─── Component ────────────────────────────────────────────────── */

const ADMIN_EMAIL = "raymond800108@gmail.com";

export default function UsagePanel({ entries, summary, onClear, kvAvailable, onRefresh, userEmail, viewMode = "self", onViewModeChange }: UsagePanelProps) {
  const { lang, t } = useI18n();
  const [showLog, setShowLog] = useState(false);
  const [logLimit, setLogLimit] = useState(20);
  const isAdmin = userEmail?.toLowerCase() === ADMIN_EMAIL;
  const viewAllUsers = viewMode === "all";
  const isSpecificUserView = viewMode !== "self" && viewMode !== "all";

  // Admin: list of users with entry counts (for dropdown)
  const [userList, setUserList] = useState<{ email: string; count: number }[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const res = await fetch("/api/usage?scope=list-users");
        const data = await res.json();
        if (Array.isArray(data.users)) setUserList(data.users);
      } catch { /* ignore */ }
    })();
  }, [isAdmin, viewMode]);

  // Daily cost chart data (last 7 days)
  const dailyCosts = useMemo(() => {
    const days: { label: string; cost: number; calls: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;
      const dayEntries = entries.filter((e) => e.timestamp >= dayStart && e.timestamp < dayEnd);
      days.push({
        label: d.toLocaleDateString(undefined, { weekday: "short" }),
        cost: dayEntries.reduce((s, e) => s + e.costUsd, 0),
        calls: dayEntries.length,
      });
    }
    return days;
  }, [entries]);

  const maxDayCost = Math.max(...dailyCosts.map((d) => d.cost), 0.01);

  const successRate = entries.length > 0
    ? Math.round((entries.filter((e) => e.status === "success").length / entries.length) * 100)
    : 100;

  return (
    <div className="space-y-5">
      {/* ── Storage status + refresh ── */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          {kvAvailable ? (
            <div className="flex items-center gap-1.5 text-[11px] text-green-600 font-medium">
              <Cloud className="w-3.5 h-3.5" />
              {t("usage.cloudSync" as TKey)}
            </div>
          ) : kvAvailable === false ? (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-600 font-medium">
              <HardDrive className="w-3.5 h-3.5" />
              {t("usage.localOnly" as TKey)}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              {t("usage.connecting" as TKey)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && onViewModeChange && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-border bg-card">
              {viewMode === "self" ? (
                <User className="w-3 h-3 text-muted" />
              ) : viewMode === "all" ? (
                <Users className="w-3 h-3 text-muted" />
              ) : (
                <User className="w-3 h-3 text-muted" />
              )}
              <select
                value={viewMode}
                onChange={(e) => onViewModeChange(e.target.value)}
                className="text-[11px] bg-transparent outline-none cursor-pointer pr-1"
              >
                <option value="self">{lang === "zh" ? "我的用量" : "My Usage"}</option>
                <option value="all">{lang === "zh" ? "所有用戶" : "All Users"}</option>
                {userList.length > 0 && (
                  <optgroup label={lang === "zh" ? "— 依帳戶 —" : "— By Account —"}>
                    {userList.map((u) => (
                      <option key={u.email} value={u.email}>
                        {u.email} ({u.count})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] text-muted hover:text-foreground border border-border hover:border-foreground/20 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {t("usage.refresh" as TKey)}
          </button>
        </div>
      </div>

      {/* Admin: viewing indicator banner */}
      {isAdmin && isSpecificUserView && (
        <div className="px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-800 flex items-center gap-2">
          <User className="w-3.5 h-3.5" />
          {lang === "zh" ? "正在查看：" : "Viewing usage for:"} <span className="font-mono font-semibold">{viewMode}</span>
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total Cost */}
        <div className="p-4 rounded-2xl bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-green-50 border border-green-100">
              <DollarSign className="w-3.5 h-3.5 text-green-600" />
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted">
              {t("usage.totalCost" as TKey)}
            </span>
          </div>
          <p className="text-xl font-bold font-mono">{formatCost(summary.totalCostUsd)}</p>
          <p className="text-[10px] text-muted mt-0.5">USD {t("usage.estimated" as TKey)}</p>
        </div>

        {/* Total Calls */}
        <div className="p-4 rounded-2xl bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-blue-50 border border-blue-100">
              <Activity className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted">
              {t("usage.totalCalls" as TKey)}
            </span>
          </div>
          <p className="text-xl font-bold font-mono">{summary.totalCalls}</p>
          <p className="text-[10px] text-muted mt-0.5">{t("usage.apiRequests" as TKey)}</p>
        </div>

        {/* Tokens */}
        <div className="p-4 rounded-2xl bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-100">
              <Zap className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted">
              {t("usage.tokens" as TKey)}
            </span>
          </div>
          <p className="text-xl font-bold font-mono">
            {(summary.totalTokensIn + summary.totalTokensOut).toLocaleString()}
          </p>
          <p className="text-[10px] text-muted mt-0.5">
            {t("usage.inOut" as TKey, {
              in: summary.totalTokensIn.toLocaleString(),
              out: summary.totalTokensOut.toLocaleString(),
            })}
          </p>
        </div>

        {/* Success Rate */}
        <div className="p-4 rounded-2xl bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-purple-50 border border-purple-100">
              <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted">
              {t("usage.successRate" as TKey)}
            </span>
          </div>
          <p className="text-xl font-bold font-mono">{successRate}%</p>
          <p className="text-[10px] text-muted mt-0.5">
            {entries.filter((e) => e.status === "error").length} {t("usage.errors" as TKey)}
          </p>
        </div>
      </div>

      {/* ── 7-day chart ── */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <h3 className="text-xs font-semibold mb-3">{t("usage.last7Days" as TKey)}</h3>
        <div className="flex items-end gap-1.5 h-24">
          {dailyCosts.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[9px] font-mono text-muted">
                {day.cost > 0 ? formatCost(day.cost) : ""}
              </span>
              <div className="w-full relative" style={{ height: 60 }}>
                <div
                  className="absolute bottom-0 w-full rounded-t bg-foreground/15 transition-all"
                  style={{ height: `${Math.max((day.cost / maxDayCost) * 100, day.cost > 0 ? 4 : 0)}%` }}
                />
              </div>
              <span className="text-[9px] text-muted">{day.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── By service breakdown ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["fal", "kie", "openai", "meshy"] as ApiService[]).map((svc) => {
          const data = summary.byService[svc];
          return (
            <div key={svc} className="p-3 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Server className="w-3 h-3 text-muted" />
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${SERVICE_COLORS[svc]}`}>
                  {SERVICE_LABELS[svc]}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold font-mono">{data.calls}</span>
                <span className="text-[10px] font-mono text-muted">{formatCost(data.costUsd)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── By user breakdown (admin only when viewing all) ── */}
      {isAdmin && viewAllUsers && (
        <div className="p-4 rounded-2xl bg-card border border-border">
          <h3 className="text-xs font-semibold mb-3 flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-muted" />
            {lang === "zh" ? "各用戶用量" : "By User"}
          </h3>
          <div className="space-y-1.5">
            {(() => {
              const byUser = new Map<string, { calls: number; cost: number }>();
              for (const e of entries) {
                const u = e.userEmail || "(unknown)";
                const cur = byUser.get(u) || { calls: 0, cost: 0 };
                cur.calls += 1;
                cur.cost += e.costUsd;
                byUser.set(u, cur);
              }
              const rows = Array.from(byUser.entries()).sort(([, a], [, b]) => b.cost - a.cost);
              if (rows.length === 0) {
                return <p className="text-xs text-muted text-center py-4">{t("usage.noData" as TKey)}</p>;
              }
              const maxCost = Math.max(...rows.map(([, v]) => v.cost), 0.0001);
              return rows.map(([email, data]) => {
                const pct = (data.cost / maxCost) * 100;
                return (
                  <div key={email} className="flex items-center gap-3">
                    <span className="text-[11px] w-48 truncate font-mono">{email}</span>
                    <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full bg-foreground/30 transition-all"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-muted w-12 text-right">{data.calls}x</span>
                    <span className="text-[10px] font-mono w-14 text-right">{formatCost(data.cost)}</span>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* ── By action breakdown ── */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <h3 className="text-xs font-semibold mb-3">{t("usage.byAction" as TKey)}</h3>
        <div className="space-y-1.5">
          {Object.entries(summary.byAction)
            .sort(([, a], [, b]) => b.costUsd - a.costUsd)
            .map(([action, data]) => {
              const labels = ACTION_LABELS[action as ApiAction];
              const label = labels ? (lang === "zh" ? labels.zh : labels.en) : action;
              const pct = summary.totalCostUsd > 0 ? (data.costUsd / summary.totalCostUsd) * 100 : 0;
              return (
                <div key={action} className="flex items-center gap-3">
                  <span className="text-[11px] w-28 truncate">{label}</span>
                  <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-foreground/30 transition-all"
                      style={{ width: `${Math.max(pct, 1)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-muted w-12 text-right">{data.calls}x</span>
                  <span className="text-[10px] font-mono w-14 text-right">{formatCost(data.costUsd)}</span>
                </div>
              );
            })}
          {Object.keys(summary.byAction).length === 0 && (
            <p className="text-xs text-muted text-center py-4">{t("usage.noData" as TKey)}</p>
          )}
        </div>
      </div>

      {/* ── Activity log ── */}
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <button
          onClick={() => setShowLog(!showLog)}
          className="w-full flex items-center justify-between p-4 hover:bg-card-hover transition-colors"
        >
          <h3 className="text-xs font-semibold">{t("usage.activityLog" as TKey)}</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted">{entries.length} {t("usage.records" as TKey)}</span>
            {showLog ? <ChevronUp className="w-3.5 h-3.5 text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-muted" />}
          </div>
        </button>

        {showLog && (
          <div className="border-t border-border">
            <div className="max-h-[400px] overflow-y-auto">
              {entries.slice(0, logLimit).map((entry) => {
                const labels = ACTION_LABELS[entry.action];
                const label = labels ? (lang === "zh" ? labels.zh : labels.en) : entry.action;
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-card-hover/50 transition-colors">
                    {entry.status === "success" ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium">{label}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${SERVICE_COLORS[entry.service]}`}>
                          {SERVICE_LABELS[entry.service]}
                        </span>
                        {isAdmin && viewAllUsers && entry.userEmail && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200 font-mono truncate max-w-[160px]">
                            {entry.userEmail}
                          </span>
                        )}
                      </div>
                      {entry.detail && (
                        <p className="text-[10px] text-muted truncate mt-0.5">{entry.detail}</p>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-muted flex-shrink-0">
                      {formatCost(entry.costUsd)}
                    </span>
                    <span className="text-[10px] text-muted flex-shrink-0 w-16 text-right">
                      {relativeTime(entry.timestamp, lang)}
                    </span>
                  </div>
                );
              })}
              {entries.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs text-muted">{t("usage.noData" as TKey)}</p>
                </div>
              )}
            </div>
            {entries.length > logLimit && (
              <button
                onClick={() => setLogLimit((l) => l + 30)}
                className="w-full py-2 text-[11px] text-muted hover:text-foreground border-t border-border transition-colors"
              >
                {t("usage.loadMore" as TKey)}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Clear + disclaimer ── */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted/60 max-w-md">
          {t("usage.disclaimer" as TKey)}
        </p>
        {entries.length > 0 && userEmail?.toLowerCase() === ADMIN_EMAIL && (
          <button
            onClick={onClear}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] text-red-500 hover:bg-red-50 border border-red-200 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            {t("usage.clear" as TKey)}
          </button>
        )}
      </div>
    </div>
  );
}
