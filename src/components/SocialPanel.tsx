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

/* ─── Step config ────────────────────────────────────────────────── */

const STEPS: { key: TKey; delay: number }[] = [
  { key: "social.step.posts", delay: 0 },
  { key: "social.step.audience", delay: 5000 },
  { key: "social.step.ai", delay: 15000 },
];

/* ─── SocialPanel ─────────────────────────────────────────────────── */

export default function SocialPanel({ logUsage }: SocialPanelProps) {
  const { t } = useI18n();

  // Tab state
  const [tab, setTab] = useState<"schedule" | "diagnosis">("diagnosis");

  // Schedule tab
  const [blotatoKey, setBlotatoKey] = useState("");

  // Diagnosis state machine
  const [phase, setPhase] = useState<Phase>("idle");
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [activeStep, setActiveStep] = useState(0);

  // Stepper timers
  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* ── On mount: check status + handle URL params ─────────────────── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedParam = params.get("connected");
    const igError = params.get("ig_error");

    // Clean URL params
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

    // Check AtSign status from API
    fetch("/api/social/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.connected) {
          setConnected(true);
          setUsername(data.username);
          if (connectedParam === "true") {
            // Auto-start diagnosis
            setTab("diagnosis");
            startDiagnosis();
          }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Start diagnosis ─────────────────────────────────────────────── */
  const startDiagnosis = () => {
    setPhase("fetching");
    setActiveStep(0);
    setDiagnosis(null);

    // Start cosmetic step timers
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
    STEPS.forEach((step, i) => {
      if (i === 0) return; // step 0 starts immediately
      const t = setTimeout(() => setActiveStep(i), step.delay);
      stepTimers.current.push(t);
    });

    // Call API
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

  /* ── Disconnect ──────────────────────────────────────────────────── */
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

  /* ── Connect AtSign ───────────────────────────────────────────── */
  const handleConnect = () => {
    window.location.href = "/api/auth/instagram";
  };

  /* ── Get error message ───────────────────────────────────────────── */
  const getErrorMessage = () => {
    if (errorKey === "denied") return t("social.err.denied");
    if (errorKey === "noAccount") return t("social.err.noAccount");
    if (errorKey === "expired") return t("social.err.expired");
    return t("social.err.generic");
  };

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
        <div className="flex flex-col items-center justify-center py-16 space-y-6">
          <div className="p-5 rounded-2xl bg-card border border-border">
            <Calendar className="w-10 h-10 text-muted/40" />
          </div>
          <div className="text-center max-w-sm">
            <h2 className="text-lg font-semibold text-foreground">{t("social.comingSoon")}</h2>
            <p className="mt-2 text-sm text-muted leading-relaxed">{t("social.comingSoonSub")}</p>
          </div>
          {/* Blotato API Key input */}
          <div className="w-full max-w-sm space-y-1.5">
            <label className="text-xs font-medium text-foreground/70">{t("social.blotatoKey")}</label>
            <input
              type="text"
              value={blotatoKey}
              onChange={(e) => setBlotatoKey(e.target.value)}
              placeholder={t("social.blotatoPlaceholder")}
              className="w-full px-4 py-2.5 rounded-full bg-card border border-border text-sm placeholder:text-muted/50 focus:outline-none focus:border-foreground/30 transition-all"
            />
          </div>
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
            {/* Format badge */}
            {diagnosis.recommendation.format && (
              <div>
                <span className="inline-flex px-2.5 py-1 rounded-full bg-foreground/10 text-foreground text-xs font-medium">
                  {diagnosis.recommendation.format}
                </span>
              </div>
            )}

            {/* Hook */}
            {diagnosis.recommendation.hook && (
              <RecommendationRow label="Hook" value={diagnosis.recommendation.hook} />
            )}
            {/* Visual direction */}
            {diagnosis.recommendation.visual_direction && (
              <RecommendationRow label="Visual" value={diagnosis.recommendation.visual_direction} />
            )}
            {/* Caption strategy */}
            {diagnosis.recommendation.caption_strategy && (
              <RecommendationRow label="Caption" value={diagnosis.recommendation.caption_strategy} />
            )}
            {/* Timing */}
            {diagnosis.recommendation.timing && (
              <RecommendationRow label="Timing" value={diagnosis.recommendation.timing} />
            )}
            {/* Rationale */}
            {diagnosis.recommendation.rationale && (
              <p className="text-xs text-muted leading-relaxed italic">{diagnosis.recommendation.rationale}</p>
            )}
          </div>

          {/* CTA */}
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
