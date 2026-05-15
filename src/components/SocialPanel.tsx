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
  Upload,
  Sparkles,
  Timer,
  Radio,
} from "lucide-react";
import { useI18n, type TKey } from "@/lib/i18n";

/* ─── Types ──────────────────────────────────────────────────────── */

// AppHistoryItem matches HistoryItem from HistoryPanel.tsx (resultUrl + mode)
interface AppHistoryItem {
  id?: string;
  resultUrl: string;
  mode?: "image" | "video" | "camera" | "3d" | "inpaint" | "lighting";
  prompt?: string;
  timestamp?: number;
}

interface SocialPanelProps {
  lang: "en" | "zh";
  user: { email: string | null; name?: string | null } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logUsage?: (...args: any[]) => any;
  history?: AppHistoryItem[];
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
  date: string;           // YYYY-MM-DD
  time: string;           // HH:MM
  timezone: string;       // IANA tz string
  mediaUrl: string;
  mediaType: "image" | "video";
  caption: string;
  platform: string | null;
  accountId: string | null;
  presetId: string | null;
  presetLabel: string | null;
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

const COMMON_TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (ET)" },
  { value: "America/Chicago",     label: "Central (CT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "UTC",                 label: "UTC" },
  { value: "Europe/London",       label: "London (GMT/BST)" },
  { value: "Europe/Paris",        label: "Paris (CET)" },
  { value: "Asia/Dubai",          label: "Dubai (GST)" },
  { value: "Asia/Shanghai",       label: "China (CST)" },
  { value: "Asia/Tokyo",          label: "Tokyo (JST)" },
  { value: "Asia/Seoul",          label: "Seoul (KST)" },
  { value: "Asia/Hong_Kong",      label: "Hong Kong (HKT)" },
  { value: "Asia/Singapore",      label: "Singapore (SGT)" },
  { value: "Australia/Sydney",    label: "Sydney (AEST)" },
];

const ACCOUNT_BUNDLES: { id: string; label: string }[] = [
  { id: "40541", label: "Socialfashionizing" },
  { id: "41782", label: "innery.lab" },
  { id: "41768", label: "necksy_de" },
];

const IG_PRESETS = [
  { id: "ig-post",  label: "Instagram — Feed Post" },
  { id: "ig-reels", label: "Instagram — Reel" },
  { id: "ig-story", label: "Instagram — Story" },
];

/* ─── History helpers ─────────────────────────────────────────────── */

interface HistoryItem {
  url: string;
  type: "image" | "video";
  timestamp?: number;
}

// Convert app HistoryItem (resultUrl + mode) to tray format (url + type)
function appHistoryToTray(items: AppHistoryItem[]): HistoryItem[] {
  return items
    .filter((item) => Boolean(item.resultUrl))
    .map((item) => ({
      url: item.resultUrl,
      type: (item.mode === "video" ? "video" : "image") as "image" | "video",
      timestamp: item.timestamp,
    }));
}

// Fallback: read from localStorage if no prop provided
function loadHistoryFromStorage(): HistoryItem[] {
  try {
    const raw = localStorage.getItem("convra-history") || "[]";
    const parsed = JSON.parse(raw) as AppHistoryItem[];
    if (Array.isArray(parsed)) return appHistoryToTray(parsed);
  } catch { /* ignore */ }
  return [];
}

/* ─── SocialPanel ─────────────────────────────────────────────────── */

export default function SocialPanel({ lang, logUsage, history: appHistory }: SocialPanelProps) {
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
  const [editTime, setEditTime] = useState("12:00");
  const [editTimezone, setEditTimezone] = useState("UTC");
  const [editCaption, setEditCaption] = useState("");
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-detect local timezone once
  const [defaultTimezone] = useState<string>(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
  });

  // Live clock — null until mounted to avoid hydration mismatch
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

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

    // Load content tray — fall back to localStorage if prop not yet populated
    if (!appHistory || appHistory.length === 0) {
      setTrayItems(loadHistoryFromStorage());
    }
  }, []);

  /* ── Sync live history prop → tray (real-time as new content generates) */
  useEffect(() => {
    if (appHistory && appHistory.length > 0) {
      setTrayItems(appHistoryToTray(appHistory));
    }
  }, [appHistory]);

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
      timezone: defaultTimezone,
      mediaUrl,
      mediaType,
      caption: "",
      platform: "instagram",
      accountId: selectedAccountId,
      presetId: null,
      presetLabel: null,
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

  /* ── Temp URL helpers ─────────────────────────────────────────── */
  function isTempUrl(url: string): boolean {
    return url.includes("tempfile.aiquickdraw.com") || url.includes("kie.ai");
  }

  async function extractMediaBlob(url: string, isVideo: boolean): Promise<Blob | null> {
    try {
      const r = await fetch(url, { cache: "force-cache" });
      if (r.ok) return await r.blob();
    } catch {}
    try {
      const r = await fetch(`/api/proxy-media?url=${encodeURIComponent(url)}`);
      if (r.ok) return await r.blob();
    } catch {}
    if (!isVideo) {
      try {
        return await new Promise<Blob | null>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) return resolve(null);
            try { ctx.drawImage(img, 0, 0); canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95); }
            catch { resolve(null); }
          };
          img.onerror = () => resolve(null);
          img.src = url;
        });
      } catch {}
    }
    return null;
  }

  /* ── Open / save edit modal ────────────────────────────────────── */
  function openEdit(post: CalendarPost) {
    setEditingPost(post);
    setEditCaption(post.caption);
    setEditTime(post.time || "12:00");
    setEditTimezone(post.timezone || defaultTimezone);
    setPublishError(null);
    setEditModalOpen(true);
  }

  function saveEdit() {
    if (!editingPost) return;
    const updated = { ...editingPost, caption: editCaption, time: editTime, timezone: editTimezone };
    setEditingPost(updated);
    setScheduledPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditModalOpen(false);
    setEditingPost(null);
  }

  /* ── Replace media ─────────────────────────────────────────────── */
  async function handleReplaceMedia(file: File) {
    if (!editingPost) return;
    setUploadingMedia(true);
    setPublishError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
      const newType: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
      setScheduledPosts((prev) => prev.map((p) => p.id === editingPost.id ? { ...p, mediaUrl: data.url, mediaType: newType } : p));
      setEditingPost((prev) => prev ? { ...prev, mediaUrl: data.url, mediaType: newType } : prev);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingMedia(false);
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = "";
    }
  }

  /* ── AI caption in modal ───────────────────────────────────────── */
  async function handleGenerateCaptionInModal() {
    if (!editingPost) return;
    setGeneratingCaption(true);
    try {
      const imageUrl = editingPost.mediaType === "video"
        ? (editingPost.mediaUrl) // best effort for video
        : editingPost.mediaUrl;
      const res = await fetch("/api/social/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl, platform: editingPost.platform || "instagram", locale: lang }),
      });
      if (res.ok) {
        const { caption } = await res.json();
        if (caption) setEditCaption(caption);
      }
    } catch {}
    setGeneratingCaption(false);
  }

  /* ── Publish post (with temp-URL re-hosting) ───────────────────── */
  async function publishPost(post: CalendarPost) {
    if (!blotatoConnected) return;
    const accId = post.accountId || selectedAccountId;
    if (!accId) return;

    setPublishingId(post.id);
    setPublishError(null);
    setScheduledPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, status: "scheduled" } : p));

    try {
      let mediaUrl = post.mediaUrl;
      if (isTempUrl(mediaUrl)) {
        const blob = await extractMediaBlob(post.mediaUrl, post.mediaType === "video");
        if (blob) {
          const ext = blob.type.includes("video") ? "mp4" : "jpg";
          const file = new File([blob], `media.${ext}`, { type: blob.type });
          const fd = new FormData();
          fd.append("file", file);
          const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
          const uploadData = await uploadRes.json();
          if (uploadData.url) {
            mediaUrl = uploadData.url;
            setScheduledPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, mediaUrl: uploadData.url } : p));
          }
        }
        if (isTempUrl(mediaUrl)) {
          throw new Error(post.mediaType === "video"
            ? "Video URL expired — please regenerate this video in Marketing tab."
            : "Media URL expired — please regenerate this content in Marketing tab.");
        }
      }

      const res = await fetch("/api/blotato/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-blotato-key": blotatoKey },
        body: JSON.stringify({
          accountId: accId,
          text: post.caption || ".",
          mediaUrls: [mediaUrl],
          platform: post.platform || "instagram",
          presetId: post.presetId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed");

      setScheduledPosts((prev) => prev.map((p) =>
        p.id === post.id ? { ...p, status: "scheduled", blotatoPostId: data.postSubmissionId ?? null } : p
      ));
      setEditingPost((prev) => prev?.id === post.id
        ? { ...prev, status: "scheduled", blotatoPostId: data.postSubmissionId ?? null } : prev
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setPublishError(msg);
      setScheduledPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, status: "draft" } : p));
      setEditingPost((prev) => prev?.id === post.id ? { ...prev, status: "draft" } : prev);
    }
    setPublishingId(null);
  }

  /* ── Delete post ───────────────────────────────────────────────── */
  function deletePost(id: string) {
    setScheduledPosts((prev) => prev.filter((p) => p.id !== id));
    if (editingPost?.id === id) {
      setEditModalOpen(false);
      setEditingPost(null);
    }
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

          {/* Live clock + pending count */}
          {now && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border">
                <Timer className="w-3.5 h-3.5 text-muted" />
                <span className="text-xs font-mono tabular-nums">
                  {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
              {scheduledPosts.filter((p) => p.status === "draft").length > 0 && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-[10px] font-semibold">
                  <Radio className="w-2.5 h-2.5 animate-pulse" />
                  {scheduledPosts.filter((p) => p.status === "draft").length} draft
                </span>
              )}
            </div>
          )}

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
                                onClick={() => openEdit(post)}
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
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(e) => { if (e.target === e.currentTarget) saveEdit(); }}
            >
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
              <div className="relative z-10 w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[editingPost.status]}`} />
                    <span className="text-sm font-semibold capitalize">{editingPost.status}</span>
                    <span className="text-xs text-muted">{editingPost.date}</span>
                  </div>
                  <button onClick={saveEdit} className="p-1.5 rounded-lg hover:bg-muted/10">
                    <X className="w-4 h-4 text-muted" />
                  </button>
                </div>

                <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">

                  {/* ① Media preview with replace overlay */}
                  <div className="flex gap-4 items-start">
                    <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-border shrink-0 group">
                      {editingPost.mediaType === "video" ? (
                        <video src={editingPost.mediaUrl} className="w-full h-full object-cover" muted />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={editingPost.mediaUrl} alt="" className="w-full h-full object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={() => replaceFileInputRef.current?.click()}
                        disabled={uploadingMedia}
                        title="Replace media"
                        className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                      >
                        {uploadingMedia
                          ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                          : <Upload className="w-5 h-5 text-white" />}
                      </button>
                      <input
                        ref={replaceFileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReplaceMedia(f); }}
                      />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <button
                        type="button"
                        onClick={() => replaceFileInputRef.current?.click()}
                        disabled={uploadingMedia}
                        className="flex items-center gap-1.5 text-[11px] text-muted hover:text-foreground"
                      >
                        {uploadingMedia
                          ? <><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</>
                          : <><Upload className="w-3 h-3" /> Replace media</>}
                      </button>
                      {isTempUrl(editingPost.mediaUrl) && editingPost.mediaType === "video" && (
                        <p className="text-[10px] text-red-500 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Temp URL — may expire before publish
                        </p>
                      )}
                    </div>
                  </div>

                  {/* ② Caption + AI generate */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted">{t("social.post.caption" as TKey)}</label>
                      <button
                        onClick={handleGenerateCaptionInModal}
                        disabled={generatingCaption}
                        className="flex items-center gap-1 text-[11px] text-accent hover:text-accent/80 disabled:opacity-40"
                      >
                        {generatingCaption ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {generatingCaption ? "Generating…" : "AI Caption"}
                      </button>
                    </div>
                    <textarea
                      value={editCaption}
                      onChange={(e) => setEditCaption(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm placeholder:text-muted/40 focus:outline-none focus:border-foreground/30 resize-none"
                      placeholder="Write your caption…"
                    />
                  </div>

                  {/* ③ Time + Timezone */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted flex items-center gap-1">
                        <Clock className="w-3 h-3" />{t("social.post.time" as TKey)}
                      </label>
                      <input
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-foreground/30"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted">Timezone</label>
                      <select
                        value={editTimezone}
                        onChange={(e) => setEditTimezone(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-foreground/30"
                      >
                        {!COMMON_TIMEZONES.some(tz => tz.value === editTimezone) && (
                          <option value={editTimezone}>{editTimezone}</option>
                        )}
                        {COMMON_TIMEZONES.map((tz) => (
                          <option key={tz.value} value={tz.value}>{tz.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* ④ Export preset (ig-post / ig-reels / ig-story) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted">Post Type</label>
                    <select
                      value={editingPost.presetId || ""}
                      onChange={(e) => {
                        const id = e.target.value || null;
                        const preset = IG_PRESETS.find((p) => p.id === id);
                        const updated = { ...editingPost, presetId: id, presetLabel: preset?.label ?? null };
                        setEditingPost(updated);
                        setScheduledPosts((prev) => prev.map((p) => p.id === updated.id ? updated : p));
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-foreground/30"
                    >
                      <option value="">Instagram — Feed Post (default)</option>
                      {IG_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted/60">
                      Story and Reel use different placements in Blotato
                    </p>
                  </div>

                  {/* ⑤ Account selector with ACCOUNT_BUNDLES */}
                  {blotatoConnected && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted">Publish To</label>
                      {ACCOUNT_BUNDLES.length > 0 ? (
                        <select
                          value={editingPost.accountId || selectedAccountId || ""}
                          onChange={(e) => {
                            const newId = e.target.value || null;
                            const live = blotatoAccounts.find((a) => a.id === newId);
                            const nextPlatform = live?.platform || editingPost.platform;
                            const updated = { ...editingPost, accountId: newId, platform: nextPlatform };
                            setEditingPost(updated);
                            setScheduledPosts((prev) => prev.map((p) => p.id === updated.id ? updated : p));
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-foreground/30"
                        >
                          <option value="">Select account…</option>
                          {ACCOUNT_BUNDLES.map((bundle) => {
                            const live = blotatoAccounts.find((a) => a.id === bundle.id);
                            return (
                              <option key={bundle.id} value={bundle.id}>
                                {bundle.label}{live ? ` — @${live.username}` : ""}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <select
                          value={editingPost.accountId || selectedAccountId || ""}
                          onChange={(e) => {
                            const newId = e.target.value;
                            const live = blotatoAccounts.find((a) => a.id === newId);
                            const updated = { ...editingPost, accountId: newId, platform: live?.platform || editingPost.platform };
                            setEditingPost(updated);
                            setScheduledPosts((prev) => prev.map((p) => p.id === updated.id ? updated : p));
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:border-foreground/30"
                        >
                          {blotatoAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.platform} — @{acc.username || acc.fullname}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {publishError && (
                    <p className="text-xs text-red-500 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />{publishError}
                    </p>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center gap-2 px-5 py-4 border-t border-border">
                  <button
                    onClick={() => deletePost(editingPost.id)}
                    className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 text-muted hover:text-red-500"
                    title={t("social.post.delete" as TKey)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="flex-1" />
                  {blotatoConnected && editingPost.status !== "scheduled" && editingPost.status !== "published" && (
                    <button
                      onClick={() => publishPost(editingPost)}
                      disabled={publishingId === editingPost.id}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-40"
                    >
                      {publishingId === editingPost.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Send className="w-3.5 h-3.5" />}
                      {t("social.post.publish" as TKey)}
                    </button>
                  )}
                  {(editingPost.status === "scheduled" || editingPost.status === "published") && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
                      editingPost.status === "published"
                        ? "bg-green-500/10 text-green-600"
                        : "bg-blue-500/10 text-blue-600"
                    }`}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t(`social.post.${editingPost.status}` as TKey)}
                    </div>
                  )}
                  <button
                    onClick={saveEdit}
                    className="px-4 py-2 rounded-xl bg-muted/10 hover:bg-muted/20 text-foreground text-sm font-medium"
                  >
                    Save
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
