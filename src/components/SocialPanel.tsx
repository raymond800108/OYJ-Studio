"use client";

import { useState, useEffect, useRef } from "react";
import {
  Calendar,
  AtSign,
  Loader2,
  CheckCircle2,
  Circle,
  TrendingUp,
  TrendingDown,
  Users,
  Star,
  Lightbulb,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  Send,
  Trash2,
  Link2,
} from "lucide-react";
import { useI18n, type TKey } from "@/lib/i18n";

/* ─── Types ──────────────────────────────────────────────────────── */

interface SocialPanelProps {
  lang: "en" | "zh";
  user: { email: string | null; name?: string | null } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logUsage?: (...args: any[]) => any;
}

type Phase = "idle" | "connecting" | "fetching" | "diagnosing" | "done" | "error";

interface DiagnosisInsight {
  insight: string;
  evidence: string;
}

interface DiagnosisResult {
  whats_working: DiagnosisInsight[];
  whats_not_working: DiagnosisInsight[];
  audience_insight: string;
  best_posting_time: { day: string; time: string; evidence: string };
  top_post: { caption_excerpt: string; reach: number; save_rate: number; why: string };
  recommendation: {
    format: string;
    visual_direction: string;
    caption_strategy: string;
    hook: string;
    timing: string;
    audience_target: string;
    rationale: string;
  };
  generation_prompt: string;
}

interface BlotatoAccount {
  id: string;
  platform: string;
  fullname: string;
  username: string;
}

interface CalendarPost {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  mediaUrl: string;
  mediaType: "image" | "video";
  caption: string;
  platform: string | null;
  accountId: string | null;
  status: "draft" | "scheduled" | "published" | "failed";
  blotatoPostId: string | null;
}

/* ─── Step config ────────────────────────────────────────────────── */

const STEPS: { key: TKey; delay: number }[] = [
  { key: "social.step.posts", delay: 0 },
  { key: "social.step.audience", delay: 5000 },
  { key: "social.step.ai", delay: 15000 },
];

const STATUS_COLORS: Record<CalendarPost["status"], string> = {
  draft: "bg-yellow-400",
  scheduled: "bg-blue-500",
  published: "bg-green-500",
  failed: "bg-red-500",
};

const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_NAMES_ZH = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

const PLATFORMS = ["instagram", "facebook", "twitter", "tiktok", "linkedin"];

/* ─── History helpers ─────────────────────────────────────────────── */

interface HistoryItem {
  url: string;
  type: "image" | "video";
  timestamp?: number;
}

function loadHistoryItems(): HistoryItem[] {
  try {
    const raw = localStorage.getItem("convra-history") ||
      localStorage.getItem("history") ||
      localStorage.getItem("ce-history") ||
      "[]";
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item: unknown) => {
          if (typeof item === "string") return true;
          if (item && typeof item === "object" && "url" in item) return true;
          return false;
        })
        .map((item: unknown): HistoryItem => {
          if (typeof item === "string") {
            return { url: item, type: "image" };
          }
          const obj = item as Record<string, unknown>;
          return {
            url: (obj.url as string) || (obj.imageUrl as string) || "",
            type: ((obj.type as string) === "video" ? "video" : "image") as "image" | "video",
            timestamp: obj.timestamp as number | undefined,
          };
        })
        .filter((item) => Boolean(item.url));
    }
  } catch {
    // ignore
  }
  return [];
}

/* ─── SocialPanel ─────────────────────────────────────────────────── */

export default function SocialPanel({ lang, logUsage }: SocialPanelProps) {
  const { t } = useI18n();

  // Tab state
  const [tab, setTab] = useState<"schedule" | "diagnosis">("diagnosis");

  /* ── Blotato state ────────────────────────────────────────────── */
  const [blotatoKey, setBlotatoKey] = useState("");
  const [blotatoConnected, setBlotatoConnected] = useState(false);
  const [blotatoAccounts, setBlotatoAccounts] = useState<BlotatoAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [blotatoLoading, setBlotatoLoading] = useState(false);

  /* ── Calendar state ────────────────────────────────────────────── */
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [scheduledPosts, setScheduledPosts] = useState<CalendarPost[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("convra-calendar-posts") || "[]");
    } catch {
      return [];
    }
  });

  /* ── Drag state ────────────────────────────────────────────────── */
  const [draggedMediaUrl, setDraggedMediaUrl] = useState<string | null>(null);
  const [draggedMediaType, setDraggedMediaType] = useState<"image" | "video">("image");

  /* ── Edit modal state ──────────────────────────────────────────── */
  const [editingPost, setEditingPost] = useState<CalendarPost | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  /* ── Content tray ──────────────────────────────────────────────── */
  const [trayItems, setTrayItems] = useState<HistoryItem[]>([]);

  /* ── Diagnosis state machine ───────────────────────────────────── */
  const [phase, setPhase] = useState<Phase>("idle");
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [activeStep, setActiveStep] = useState(0);

  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* ── Persist posts to localStorage ─────────────────────────────── */
  useEffect(() => {
    localStorage.setItem("convra-calendar-posts", JSON.stringify(scheduledPosts));
  }, [scheduledPosts]);

  /* ── Load Blotato key + tray items on mount ─────────────────────── */
  useEffect(() => {
    const savedKey = localStorage.getItem("convra-blotato-key");
    if (savedKey) {
      setBlotatoKey(savedKey);
      // Silently auto-reconnect
      fetch("/api/blotato/accounts", {
        headers: { "x-blotato-key": savedKey },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data) {
            const accounts = Array.isArray(data) ? data : (data.data ?? []);
            setBlotatoAccounts(accounts);
            setBlotatoConnected(true);
            if (accounts.length > 0) setSelectedAccountId(accounts[0].id);
          }
        })
        .catch(() => {});
    }

    // Load content tray from history
    setTrayItems(loadHistoryItems());
  }, []);

  /* ── On mount: check status + handle URL params ─────────────────── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedParam = params.get("connected");
    const igError = params.get("ig_error");

    if (params.has("connected") || params.has("ig_error")) {
      const clean = new URL(window.location.href);
      clean.searchParams.delete("connected");
      clean.searchParams.delete("ig_error");
      window.history.replaceState({}, "", clean.toString());
    }

    if (igError) {
      setPhase("error");
      setErrorKey(igError);
      setTab("diagnosis");
      return;
    }

    fetch("/api/social/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setConnected(true);
          setUsername(data.username);
          if (connectedParam === "true") {
            setTab("diagnosis");
            startDiagnosis();
          }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Blotato connect ─────────────────────────────────────────────── */
  async function connectBlotato() {
    if (!blotatoKey.trim()) return;
    setBlotatoLoading(true);
    try {
      const res = await fetch("/api/blotato/accounts", {
        headers: { "x-blotato-key": blotatoKey.trim() },
      });
      if (res.ok) {
        const data = await res.json();
        const accounts: BlotatoAccount[] = Array.isArray(data) ? data : (data.data ?? []);
        setBlotatoAccounts(accounts);
        setBlotatoConnected(true);
        if (accounts.length > 0) setSelectedAccountId(accounts[0].id);
        localStorage.setItem("convra-blotato-key", blotatoKey.trim());
      }
    } catch {
      // ignore
    }
    setBlotatoLoading(false);
  }

  function disconnectBlotato() {
    setBlotatoConnected(false);
    setBlotatoAccounts([]);
    setSelectedAccountId(null);
    setBlotatoKey("");
    localStorage.removeItem("convra-blotato-key");
  }

  /* ── Calendar helpers ──────────────────────────────────────────── */
  function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
  }
  function getFirstDayOfMonth(year: number, month: number) {
    return new Date(year, month, 1).getDay(); // 0=Sun
  }
  function formatDate(year: number, month: number, day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function getPostsForDate(date: string) {
    return scheduledPosts.filter((p) => p.date === date);
  }

  function prevMonth() {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear((y) => y - 1);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear((y) => y + 1);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  }

  /* ── Add post to calendar ──────────────────────────────────────── */
  async function addPostToDate(date: string, mediaUrl: string, mediaType: "image" | "video") {
    const newPost: CalendarPost = {
      id: crypto.randomUUID(),
      date,
      time: "09:00",
      mediaUrl,
      mediaType,
      caption: "",
      platform: "instagram",
      accountId: selectedAccountId,
      status: "draft",
      blotatoPostId: null,
    };
    setScheduledPosts((prev) => [...prev, newPost]);

    // Auto-generate caption for images
    if (mediaType === "image") {
      try {
        const res = await fetch("/api/social/caption", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: mediaUrl,
            platform: "instagram",
            locale: lang,
          }),
        });
        if (res.ok) {
          const { caption } = await res.json();
          setScheduledPosts((prev) =>
            prev.map((p) => (p.id === newPost.id ? { ...p, caption } : p))
          );
          // Update editing post if it's open for this post
          setEditingPost((prev) =>
            prev?.id === newPost.id ? { ...prev, caption } : prev
          );
        }
      } catch {
        // ignore caption errors
      }
    }
  }

  /* ── Publish post ──────────────────────────────────────────────── */
  async function publishPost(post: CalendarPost) {
    if (!blotatoConnected) return;
    const accId = post.accountId || selectedAccountId;
    if (!accId) return;

    try {
      const res = await fetch("/api/blotato/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-blotato-key": blotatoKey,
        },
        body: JSON.stringify({
          accountId: accId,
          text: post.caption,
          mediaUrls: [post.mediaUrl],
          platform: post.platform || "instagram",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setScheduledPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? { ...p, status: "scheduled", blotatoPostId: data.postSubmissionId ?? null }
              : p
          )
        );
        setEditingPost((prev) =>
          prev?.id === post.id
            ? { ...prev, status: "scheduled", blotatoPostId: data.postSubmissionId ?? null }
            : prev
        );
      } else {
        setScheduledPosts((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, status: "failed" } : p))
        );
        setEditingPost((prev) =>
          prev?.id === post.id ? { ...prev, status: "failed" } : prev
        );
      }
    } catch {
      setScheduledPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, status: "failed" } : p))
      );
    }
  }

  /* ── Delete post ───────────────────────────────────────────────── */
  function deletePost(id: string) {
    setScheduledPosts((prev) => prev.filter((p) => p.id !== id));
    if (editingPost?.id === id) {
      setEditModalOpen(false);
      setEditingPost(null);
    }
  }

  /* ── Update editing post field ─────────────────────────────────── */
  function updateEditingPost(field: keyof CalendarPost, value: string) {
    setEditingPost((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, [field]: value };
      setScheduledPosts((posts) =>
        posts.map((p) => (p.id === updated.id ? updated : p))
      );
      return updated;
    });
  }

  /* ── Diagnosis helpers ─────────────────────────────────────────── */
  const startDiagnosis = () => {
    setPhase("fetching");
    setActiveStep(0);
    setDiagnosis(null);

    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
    STEPS.forEach((step, i) => {
      if (i === 0) return;
      const timer = setTimeout(() => setActiveStep(i), step.delay);
      stepTimers.current.push(timer);
    });

    fetch("/api/social/diagnose", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        stepTimers.current.forEach(clearTimeout);
        if (data.error) {
          if (data.error === "TOKEN_EXPIRED") {
            setConnected(false);
            setUsername(null);
            setPhase("error");
            setErrorKey("expired");
          } else {
            setPhase("error");
            setErrorKey("generic");
          }
          logUsage?.("ig-diagnose", { status: "error", detail: data.error });
          return;
        }
        setDiagnosis(data as DiagnosisResult);
        setPhase("done");
        logUsage?.("ig-diagnose", { status: "success" });
      })
      .catch(() => {
        stepTimers.current.forEach(clearTimeout);
        setPhase("error");
        setErrorKey("generic");
        logUsage?.("ig-diagnose", { status: "error", detail: "network error" });
      });
  };

  const handleDisconnect = () => {
    fetch("/api/social/disconnect", { method: "POST" })
      .then(() => {
        setConnected(false);
        setUsername(null);
        setDiagnosis(null);
        setPhase("idle");
      })
      .catch(() => {});
  };

  const handleConnect = () => {
    window.location.href = "/api/auth/instagram";
  };

  const getErrorMessage = () => {
    if (errorKey === "denied") return t("social.err.denied");
    if (errorKey === "noAccount") return t("social.err.noAccount");
    if (errorKey === "expired") return t("social.err.expired");
    return t("social.err.generic");
  };

  /* ─── Computed calendar values ─────────────────────────────────── */
  const firstDay = getFirstDayOfMonth(calendarYear, calendarMonth);
  const offset = (firstDay + 6) % 7; // Mon-first
  const daysInMonth = getDaysInMonth(calendarYear, calendarMonth);
  const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;
  const monthName =
    lang === "zh"
      ? MONTH_NAMES_ZH[calendarMonth]
      : MONTH_NAMES_EN[calendarMonth];

  /* ─── Render ───────────────────────────────────────────────────── */
  return (
    <div className="space-y-5">
      {/* Tab Switcher */}
      <div className="flex items-center bg-background border border-border rounded-full p-0.5 gap-0.5 w-fit">
        {(["schedule", "diagnosis"] as const).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              tab === tabKey
                ? "bg-foreground text-background shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t(`social.${tabKey}` as TKey)}
          </button>
        ))}
      </div>

      {/* ── Schedule Tab ──────────────────────────────────────────── */}
      {tab === "schedule" && (
        <div className="space-y-4">

          {/* Blotato Connection Panel */}
          <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
            {!blotatoConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-muted/60" />
                  <span className="text-sm font-medium text-foreground">
                    {t("social.blotato.connect" as TKey)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={blotatoKey}
                    onChange={(e) => setBlotatoKey(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && connectBlotato()}
                    placeholder={t("social.blotato.keyPlaceholder" as TKey)}
                    className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-sm placeholder:text-muted/40 focus:outline-none focus:border-foreground/30 transition-all"
                  />
                  <button
                    onClick={connectBlotato}
                    disabled={blotatoLoading || !blotatoKey.trim()}
                    className="px-4 py-2 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2 shrink-0"
                  >
                    {blotatoLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    {t("social.blotato.connect" as TKey)}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">
                      {t("social.blotato.connected" as TKey)}
                    </span>
                  </div>
                  <span className="text-xs text-muted">
                    {blotatoAccounts.length} {t("social.blotato.accounts" as TKey)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {blotatoAccounts.length > 1 && (
                    <select
                      value={selectedAccountId || ""}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="text-xs rounded-lg bg-background border border-border px-2 py-1.5 focus:outline-none"
                    >
                      {blotatoAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.platform} — @{acc.username || acc.fullname}
                        </option>
                      ))}
                    </select>
                  )}
                  {blotatoAccounts.length === 1 && (
                    <span className="text-xs text-muted">
                      {blotatoAccounts[0].platform} — @{blotatoAccounts[0].username || blotatoAccounts[0].fullname}
                    </span>
                  )}
                  <button
                    onClick={disconnectBlotato}
                    className="text-xs text-muted hover:text-foreground underline transition-colors"
                  >
                    {t("social.blotato.disconnect" as TKey)}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Two-column layout */}
          <div className="flex gap-4" style={{ minHeight: "520px" }}>

            {/* LEFT — Calendar Grid (2/3) */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* Month navigator */}
              <div className="flex items-center justify-between">
                <button
                  onClick={prevMonth}
                  className="p-1.5 rounded-lg hover:bg-card border border-transparent hover:border-border transition-all"
                  aria-label={t("social.calendar.prev" as TKey)}
                >
                  <ChevronLeft className="w-4 h-4 text-muted" />
                </button>
                <h3 className="text-sm font-semibold text-foreground">
                  {monthName} {calendarYear}
                </h3>
                <button
                  onClick={nextMonth}
                  className="p-1.5 rounded-lg hover:bg-card border border-transparent hover:border-border transition-all"
                  aria-label={t("social.calendar.next" as TKey)}
                >
                  <ChevronRight className="w-4 h-4 text-muted" />
                </button>
              </div>

              {/* Day-of-week headers (Mon-first) */}
              <div className="grid grid-cols-7 gap-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div
                    key={d}
                    className="text-center text-[10px] font-medium text-muted/60 py-1"
                  >
                    {d}
                  </div>
                ))}

                {/* Calendar cells */}
                {Array.from({ length: totalCells }, (_, i) => {
                  const dayNum = i - offset + 1;
                  const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth;
                  const dateStr = isCurrentMonth
                    ? formatDate(calendarYear, calendarMonth, dayNum)
                    : "";
                  const dayPosts = isCurrentMonth ? getPostsForDate(dateStr) : [];
                  const today = new Date();
                  const isToday =
                    isCurrentMonth &&
                    dayNum === today.getDate() &&
                    calendarMonth === today.getMonth() &&
                    calendarYear === today.getFullYear();

                  return (
                    <div
                      key={i}
                      onDragOver={(e) => {
                        if (isCurrentMonth) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!isCurrentMonth) return;
                        const url =
                          e.dataTransfer.getData("text/x-media-url") ||
                          draggedMediaUrl;
                        const mType = (e.dataTransfer.getData("text/x-media-type") ||
                          draggedMediaType) as "image" | "video";
                        if (url) {
                          addPostToDate(dateStr, url, mType);
                        }
                        setDraggedMediaUrl(null);
                      }}
                      className={`relative rounded-lg border transition-all min-h-[72px] p-1 ${
                        isCurrentMonth
                          ? "border-border bg-card hover:border-foreground/20 cursor-pointer"
                          : "border-transparent bg-transparent"
                      } ${isToday ? "border-foreground/30 ring-1 ring-foreground/10" : ""}`}
                    >
                      {isCurrentMonth && (
                        <>
                          <div
                            className={`text-[11px] font-medium mb-1 ${
                              isToday ? "text-foreground" : "text-muted/70"
                            }`}
                          >
                            {dayNum}
                          </div>
                          {/* Post thumbnails */}
                          <div className="space-y-0.5">
                            {dayPosts.slice(0, 3).map((post) => (
                              <button
                                key={post.id}
                                onClick={() => {
                                  setEditingPost(post);
                                  setEditModalOpen(true);
                                }}
                                className="w-full flex items-center gap-1 rounded overflow-hidden group"
                                title={post.caption || "Draft"}
                              >
                                {post.mediaType === "image" ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={post.mediaUrl}
                                    alt=""
                                    className="w-5 h-5 object-cover rounded shrink-0"
                                  />
                                ) : (
                                  <div className="w-5 h-5 rounded shrink-0 bg-muted/20 flex items-center justify-center">
                                    <span className="text-[8px]">&#9654;</span>
                                  </div>
                                )}
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[post.status]}`}
                                />
                              </button>
                            ))}
                            {dayPosts.length > 3 && (
                              <div className="text-[9px] text-muted pl-0.5">
                                +{dayPosts.length - 3}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 pt-1">
                {(Object.entries(STATUS_COLORS) as [CalendarPost["status"], string][]).map(
                  ([status, color]) => (
                    <div key={status} className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${color}`} />
                      <span className="text-[10px] text-muted capitalize">
                        {t(`social.post.${status}` as TKey)}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* RIGHT — Content Tray (1/3) */}
            <div className="w-52 shrink-0 space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-0.5">
                  {t("social.tray.title" as TKey)}
                </h4>
                <p className="text-[10px] text-muted">
                  {t("social.tray.drag" as TKey)}
                </p>
              </div>

              <div className="space-y-2 overflow-y-auto" style={{ maxHeight: "480px" }}>
                {trayItems.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border p-4 text-center">
                    <Calendar className="w-6 h-6 text-muted/30 mx-auto mb-2" />
                    <p className="text-[11px] text-muted leading-relaxed">
                      {t("social.tray.empty" as TKey)}
                    </p>
                  </div>
                )}
                {trayItems.map((item, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/x-media-url", item.url);
                      e.dataTransfer.setData("text/x-media-type", item.type);
                      setDraggedMediaUrl(item.url);
                      setDraggedMediaType(item.type);
                    }}
                    className="relative rounded-xl overflow-hidden border border-border cursor-grab active:cursor-grabbing hover:border-foreground/30 transition-all group"
                    style={{ aspectRatio: "1/1" }}
                  >
                    {item.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt=""
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full bg-muted/10 flex items-center justify-center">
                        <span className="text-2xl opacity-50">&#9654;</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all" />
                    <div className="absolute bottom-1 left-1 right-1 text-[9px] text-white/80 opacity-0 group-hover:opacity-100 transition-all font-medium drop-shadow text-center">
                      {t("social.tray.drag" as TKey)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Edit Modal ──────────────────────────────────────────── */}
          {editModalOpen && editingPost && (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setEditModalOpen(false);
                }
              }}
            >
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

              {/* Modal */}
              <div className="relative z-10 w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[editingPost.status]}`}
                    />
                    <span className="text-sm font-semibold text-foreground capitalize">
                      {t(`social.post.${editingPost.status}` as TKey)}
                    </span>
                  </div>
                  <button
                    onClick={() => setEditModalOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-muted/10 transition-colors"
                  >
                    <X className="w-4 h-4 text-muted" />
                  </button>
                </div>

                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                  {/* Media preview */}
                  <div className="rounded-xl overflow-hidden bg-muted/5 border border-border">
                    {editingPost.mediaType === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={editingPost.mediaUrl}
                        alt=""
                        className="w-full max-h-48 object-contain"
                      />
                    ) : (
                      <div className="h-32 flex items-center justify-center">
                        <span className="text-4xl opacity-40">&#9654;</span>
                      </div>
                    )}
                  </div>

                  {/* Caption */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted">
                      {t("social.post.caption" as TKey)}
                    </label>
                    <textarea
                      value={editingPost.caption}
                      onChange={(e) => updateEditingPost("caption", e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm placeholder:text-muted/40 focus:outline-none focus:border-foreground/30 transition-all resize-none"
                      placeholder="Write your caption..."
                    />
                  </div>

                  {/* Time + Platform row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {t("social.post.time" as TKey)}
                      </label>
                      <input
                        type="time"
                        value={editingPost.time}
                        onChange={(e) => updateEditingPost("time", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-foreground/30 transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted">
                        {t("social.post.platform" as TKey)}
                      </label>
                      <select
                        value={editingPost.platform || "instagram"}
                        onChange={(e) => updateEditingPost("platform", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-foreground/30 transition-all capitalize"
                      >
                        {PLATFORMS.map((p) => (
                          <option key={p} value={p} className="capitalize">
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Account selector if Blotato connected */}
                  {blotatoConnected && blotatoAccounts.length > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted">Account</label>
                      <select
                        value={editingPost.accountId || selectedAccountId || ""}
                        onChange={(e) => updateEditingPost("accountId", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-foreground/30 transition-all"
                      >
                        {blotatoAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.platform} — @{acc.username || acc.fullname}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Footer actions */}
                <div className="flex items-center gap-2 px-5 py-4 border-t border-border">
                  <button
                    onClick={() => deletePost(editingPost.id)}
                    className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 text-muted hover:text-red-500 transition-all"
                    title={t("social.post.delete" as TKey)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="flex-1" />
                  {blotatoConnected && editingPost.status !== "scheduled" && editingPost.status !== "published" && (
                    <button
                      onClick={() => publishPost(editingPost)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {t("social.post.publish" as TKey)}
                    </button>
                  )}
                  {editingPost.status === "scheduled" && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 text-xs font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t("social.post.scheduled" as TKey)}
                    </div>
                  )}
                  {editingPost.status === "published" && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 text-xs font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t("social.post.published" as TKey)}
                    </div>
                  )}
                  <button
                    onClick={() => setEditModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-muted/10 hover:bg-muted/20 text-foreground text-sm font-medium transition-all"
                  >
                    {t("invoice.cancel" as TKey)}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Diagnosis Tab ─────────────────────────────────────────── */}
      {tab === "diagnosis" && (
        <div className="space-y-5">
          {/* Error state */}
          {phase === "error" && (
            <div className="flex items-start gap-3 px-4 py-3.5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm text-red-700 dark:text-red-400">{getErrorMessage()}</p>
                <button
                  onClick={() => { setPhase("idle"); setErrorKey(null); }}
                  className="text-xs font-medium text-red-600 dark:text-red-400 underline"
                >
                  {t("social.tryAgain")}
                </button>
              </div>
            </div>
          )}

          {/* Not connected */}
          {!connected && phase !== "error" && (
            <NotConnectedView
              onConnect={handleConnect}
              t={t}
            />
          )}

          {/* Connected + idle */}
          {connected && phase === "idle" && (
            <ConnectedIdleView
              username={username}
              onRunDiagnosis={startDiagnosis}
              onDisconnect={handleDisconnect}
              t={t}
            />
          )}

          {/* Loading (fetching / diagnosing) */}
          {connected && (phase === "fetching" || phase === "diagnosing" || phase === "connecting") && (
            <LoadingView
              activeStep={activeStep}
              t={t}
            />
          )}

          {/* Results */}
          {phase === "done" && diagnosis && (
            <ResultsView
              diagnosis={diagnosis}
              username={username}
              onRunAgain={() => {
                setDiagnosis(null);
                startDiagnosis();
              }}
              onDisconnect={handleDisconnect}
              t={t}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function NotConnectedView({
  onConnect,
  t,
}: {
  onConnect: () => void;
  t: (key: TKey) => string;
}) {
  return (
    <div className="max-w-lg mx-auto space-y-6 py-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-card border border-border">
          <AtSign className="w-7 h-7 text-muted/60" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">{t("social.connect.headline")}</h2>
      </div>

      <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
        {(["social.connect.p1", "social.connect.p2", "social.connect.p3"] as TKey[]).map((key) => (
          <div key={key} className="flex items-start gap-3">
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
            <span className="text-sm text-foreground/80">{t(key)}</span>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <button
          onClick={onConnect}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-foreground text-background font-medium text-sm hover:opacity-90 transition-all shadow-sm"
        >
          <AtSign className="w-4 h-4" />
          {t("social.connect.cta")}
        </button>
        <p className="text-center text-xs text-muted leading-relaxed">{t("social.connect.note")}</p>
      </div>
    </div>
  );
}

function ConnectedIdleView({
  username,
  onRunDiagnosis,
  onDisconnect,
  t,
}: {
  username: string | null;
  onRunDiagnosis: () => void;
  onDisconnect: () => void;
  t: (key: TKey) => string;
}) {
  return (
    <div className="max-w-lg mx-auto space-y-5 py-4">
      {/* Connected badge */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 w-fit">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-sm font-medium text-green-700 dark:text-green-400">
          @{username || "connected"}
        </span>
      </div>

      <div className="rounded-2xl bg-card border border-border p-6 space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{t("social.idle.headline")}</h2>
        <p className="text-sm text-muted leading-relaxed">{t("social.idle.sub")}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onRunDiagnosis}
          className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-foreground text-background font-medium text-sm hover:opacity-90 transition-all shadow-sm"
        >
          <TrendingUp className="w-4 h-4" />
          {t("social.run")}
        </button>
        <button
          onClick={onDisconnect}
          className="px-5 py-3.5 rounded-full bg-card border border-border text-sm text-muted hover:text-foreground hover:border-border-hover transition-all"
        >
          {t("social.disconnect")}
        </button>
      </div>
    </div>
  );
}

function LoadingView({
  activeStep,
  t,
}: {
  activeStep: number;
  t: (key: TKey) => string;
}) {
  return (
    <div className="max-w-lg mx-auto py-10 space-y-8">
      <div className="space-y-4">
        {STEPS.map((step, i) => {
          const isDone = i < activeStep;
          const isActive = i === activeStep;
          return (
            <div key={step.key} className="flex items-center gap-4">
              <div className="shrink-0">
                {isDone ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : isActive ? (
                  <Loader2 className="w-5 h-5 text-foreground animate-spin" />
                ) : (
                  <Circle className="w-5 h-5 text-muted/30" />
                )}
              </div>
              <span
                className={`text-sm transition-colors ${
                  isActive
                    ? "text-foreground font-medium"
                    : isDone
                    ? "text-muted"
                    : "text-muted/40"
                }`}
              >
                {t(step.key)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResultsView({
  diagnosis,
  username,
  onRunAgain,
  onDisconnect,
  t,
}: {
  diagnosis: DiagnosisResult;
  username: string | null;
  onRunAgain: () => void;
  onDisconnect: () => void;
  t: (key: TKey) => string;
}) {
  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm font-medium text-muted">@{username}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRunAgain}
            className="px-4 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-muted hover:text-foreground transition-all"
          >
            {t("social.run")}
          </button>
          <button
            onClick={onDisconnect}
            className="px-4 py-1.5 rounded-full bg-card border border-border text-xs font-medium text-muted hover:text-foreground transition-all"
          >
            {t("social.disconnect")}
          </button>
        </div>
      </div>

      {/* What's Working */}
      {diagnosis.whats_working?.length > 0 && (
        <InsightCard
          title={t("social.working")}
          icon={<TrendingUp className="w-4 h-4 text-green-600" />}
          borderColor="border-l-green-500"
          bgColor="bg-green-50/50 dark:bg-green-950/20"
          items={diagnosis.whats_working}
        />
      )}

      {/* What's Not Working */}
      {diagnosis.whats_not_working?.length > 0 && (
        <InsightCard
          title={t("social.notWorking")}
          icon={<TrendingDown className="w-4 h-4 text-red-500" />}
          borderColor="border-l-red-500"
          bgColor="bg-red-50/50 dark:bg-red-950/20"
          items={diagnosis.whats_not_working}
        />
      )}

      {/* Audience */}
      {diagnosis.audience_insight && (
        <div className="rounded-2xl bg-card border border-border border-l-4 border-l-purple-500 p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-foreground">{t("social.audience")}</h3>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{diagnosis.audience_insight}</p>
          {diagnosis.best_posting_time && (
            <p className="text-xs text-muted">
              <span className="font-medium">{t("social.bestTime")}</span>{" "}
              {diagnosis.best_posting_time.day} {diagnosis.best_posting_time.time}
              {diagnosis.best_posting_time.evidence && (
                <span className="italic"> — {diagnosis.best_posting_time.evidence}</span>
              )}
            </p>
          )}
        </div>
      )}

      {/* Top Post */}
      {diagnosis.top_post && (
        <div className="rounded-2xl bg-card border border-border border-l-4 border-l-amber-500 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">{t("social.topPost")}</h3>
          </div>
          {diagnosis.top_post.caption_excerpt && (
            <p className="text-sm text-foreground/80 leading-relaxed italic">
              &ldquo;{diagnosis.top_post.caption_excerpt}&rdquo;
            </p>
          )}
          <div className="flex items-center gap-4 text-xs text-muted flex-wrap">
            {diagnosis.top_post.reach != null && (
              <span>
                <span className="font-semibold text-foreground">{diagnosis.top_post.reach.toLocaleString()}</span> reach
              </span>
            )}
            {diagnosis.top_post.save_rate != null && (
              <span>
                <span className="font-semibold text-foreground">
                  {(diagnosis.top_post.save_rate * 100).toFixed(1)}%
                </span>{" "}
                save rate
              </span>
            )}
          </div>
          {diagnosis.top_post.why && (
            <p className="text-xs text-muted leading-relaxed">{diagnosis.top_post.why}</p>
          )}
        </div>
      )}

      {/* Next Post Recommendation */}
      {diagnosis.recommendation && (
        <div className="rounded-2xl bg-card border-2 border-foreground/10 p-5 space-y-4 w-full">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-foreground" />
            <h3 className="text-sm font-semibold text-foreground">{t("social.nextPost")}</h3>
          </div>

          <div className="space-y-3">
            {diagnosis.recommendation.format && (
              <div>
                <span className="inline-flex px-2.5 py-1 rounded-full bg-foreground/10 text-foreground text-xs font-medium">
                  {diagnosis.recommendation.format}
                </span>
              </div>
            )}
            {diagnosis.recommendation.hook && (
              <RecommendationRow label="Hook" value={diagnosis.recommendation.hook} />
            )}
            {diagnosis.recommendation.visual_direction && (
              <RecommendationRow label="Visual" value={diagnosis.recommendation.visual_direction} />
            )}
            {diagnosis.recommendation.caption_strategy && (
              <RecommendationRow label="Caption" value={diagnosis.recommendation.caption_strategy} />
            )}
            {diagnosis.recommendation.timing && (
              <RecommendationRow label="Timing" value={diagnosis.recommendation.timing} />
            )}
            {diagnosis.recommendation.rationale && (
              <p className="text-xs text-muted leading-relaxed italic">{diagnosis.recommendation.rationale}</p>
            )}
          </div>

          <button
            onClick={() =>
              alert(
                "Copy this prompt to Marketing tab:\n\n" +
                  (diagnosis.generation_prompt || diagnosis.recommendation?.visual_direction || "")
              )
            }
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all"
          >
            {t("social.generate")}
          </button>
        </div>
      )}
    </div>
  );
}

function InsightCard({
  title,
  icon,
  borderColor,
  bgColor,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  borderColor: string;
  bgColor: string;
  items: { insight: string; evidence: string }[];
}) {
  return (
    <div
      className={`rounded-2xl bg-card border border-border border-l-4 ${borderColor} ${bgColor} p-5 space-y-3`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="space-y-0.5">
            <p className="text-sm text-foreground/90 font-medium">{item.insight}</p>
            <p className="text-xs text-muted leading-relaxed">{item.evidence}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecommendationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-xs font-semibold text-muted/60 uppercase tracking-wide shrink-0 pt-0.5 w-14">
        {label}
      </span>
      <p className="text-sm text-foreground/80 leading-relaxed">{value}</p>
    </div>
  );
}
