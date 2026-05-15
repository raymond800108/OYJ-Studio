"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Loader2,
  Sparkles,
  AlertCircle,
  Plug,
  CheckCircle2,
  RefreshCw,
  LogOut,
  ArrowRight,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

/* ─── Types matching /api/meta-ads/* responses ─────────────────── */

interface StatusResp {
  connected: boolean;
  user_name?: string | null;
  connected_at?: number | null;
  token_expires_at?: number | null;
}

interface AdAccount {
  id: string;
  name: string;
  account_status: number;
  currency: string;
  timezone_name: string;
}

interface Insight {
  insight: string;
  evidence: string;
}

interface Diagnosis {
  account_summary: string;
  whats_working: Insight[];
  whats_not_working: Insight[];
  best_campaign: { name: string; spend: string; roas: string; why: string } | null;
  best_ad: { name: string; ctr: string; roas: string; why: string } | null;
  budget_recommendation: { action: string; rationale: string };
  next_campaign: {
    objective: string;
    audience: string;
    format: "Reel" | "Carousel" | "Single Image" | "Story";
    hook: string;
    budget: string;
    rationale: string;
  };
  generation_prompt: string;
}

/* ─── Loading steps (decoupled from real timing) ───────────────── */

type Phase =
  | "idle"
  | "fetching_accounts"
  | "fetching_insights"
  | "diagnosing"
  | "done"
  | "error";

const LOADING_STEPS: { phase: Phase; key: string; startMs: number }[] = [
  { phase: "fetching_accounts", key: "ads.step.accounts", startMs: 0 },
  { phase: "fetching_insights", key: "ads.step.insights", startMs: 4000 },
  { phase: "diagnosing", key: "ads.step.ai", startMs: 12000 },
];

const FORMAT_BADGE: Record<Diagnosis["next_campaign"]["format"], string> = {
  Reel: "bg-pink-500/15 text-pink-600 border-pink-500/30",
  Carousel: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  "Single Image": "bg-violet-500/15 text-violet-600 border-violet-500/30",
  Story: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

const MA_ERROR_KEYS: Record<string, string> = {
  denied: "Connection cancelled. Try again when you're ready.",
  token_expired: "Your Meta Ads connection expired. Please reconnect.",
  no_ad_accounts:
    "No ad accounts found. Make sure you have admin access to a Meta Business Manager.",
  login_required: "Please sign in to Convra first, then reconnect Meta Ads.",
  invalid_request: "Connection request was invalid. Please try again.",
  invalid_state: "Session expired during OAuth — please try again.",
  token_failed: "Couldn't exchange the OAuth code for a token.",
  token_exchange_failed: "Couldn't upgrade to a long-lived token.",
  server_error: "Meta Ads OAuth is not configured on this deployment.",
  unknown: "Unknown error during OAuth.",
};

/* ─── Page entry (Suspense wrapper for useSearchParams) ────────── */

export default function AdsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-5 h-5 animate-spin text-muted" />
        </div>
      }
    >
      <AdsContent />
    </Suspense>
  );
}

/* ─── Main content ─────────────────────────────────────────────── */

function AdsContent() {
  const { t } = useI18n();
  const router = useRouter();
  const search = useSearchParams();

  const [status, setStatus] = useState<StatusResp | null>(null);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [loadingStepKey, setLoadingStepKey] = useState<string>("");

  // Read URL params (?connected=true / ?ma_error=...)
  const justConnected = search.get("connected") === "true";
  const urlError = search.get("ma_error");

  // Surface URL errors to local error state
  useEffect(() => {
    if (urlError) {
      setError(MA_ERROR_KEYS[urlError] ?? `Meta Ads error: ${urlError}`);
      // Clean URL
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, [urlError]);

  /* ─ Status check on mount ─────────────────────────────────── */
  useEffect(() => {
    fetch("/api/meta-ads/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));
  }, []);

  /* ─ Animated loading-step transitions ──────────────────────── */
  useEffect(() => {
    if (phase === "idle" || phase === "done" || phase === "error") return;
    const timers = LOADING_STEPS.map((step) =>
      window.setTimeout(() => setLoadingStepKey(step.key), step.startMs)
    );
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  /* ─ Fetch accounts ──────────────────────────────────────────── */
  const fetchAccounts = useCallback(async () => {
    setPhase("fetching_accounts");
    setError(null);
    setDiagnosis(null);
    try {
      const r = await fetch("/api/meta-ads/accounts");
      if (r.status === 401) {
        const j = await r.json();
        if (j.error === "TOKEN_EXPIRED") {
          setStatus({ connected: false });
          throw new Error(MA_ERROR_KEYS.token_expired);
        }
        throw new Error("Not connected");
      }
      const data = (await r.json()) as AdAccount[];
      if (!data || data.length === 0) {
        throw new Error(MA_ERROR_KEYS.no_ad_accounts);
      }
      setAccounts(data);
      // Auto-select if only one
      if (data.length === 1) {
        setSelectedAccount(data[0].id);
      } else if (!selectedAccount) {
        setSelectedAccount(data[0].id);
      }
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch ad accounts");
      setPhase("error");
      return null;
    }
  }, [selectedAccount]);

  /* ─ Run diagnosis for selected account ─────────────────────── */
  const runDiagnosis = useCallback(
    async (accountId: string, force = false) => {
      setPhase("fetching_insights");
      setError(null);
      setDiagnosis(null);
      try {
        const r = await fetch("/api/meta-ads/diagnose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: accountId, force }),
        });
        if (r.status === 401) {
          setStatus({ connected: false });
          throw new Error(MA_ERROR_KEYS.token_expired);
        }
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || `Diagnose failed (${r.status})`);
        }
        // Move to diagnosing phase visually
        setPhase("diagnosing");
        const data = (await r.json()) as Diagnosis;
        setDiagnosis(data);
        setPhase("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Diagnosis failed");
        setPhase("error");
      }
    },
    []
  );

  /* ─ Auto-run after successful OAuth callback ───────────────── */
  useEffect(() => {
    if (justConnected && status?.connected && phase === "idle") {
      (async () => {
        const list = await fetchAccounts();
        if (list && list.length > 0) {
          await runDiagnosis(list[0].id);
        }
      })();
    }
  }, [justConnected, status?.connected, phase, fetchAccounts, runDiagnosis]);

  /* ─ Handlers ───────────────────────────────────────────────── */

  const handleConnect = () => {
    window.location.href = "/api/auth/meta-ads";
  };

  const handleDisconnect = async () => {
    if (!confirm(t("ads.confirmDisconnect"))) return;
    await fetch("/api/meta-ads/disconnect", { method: "POST" });
    setStatus({ connected: false });
    setAccounts([]);
    setSelectedAccount("");
    setDiagnosis(null);
    setPhase("idle");
    setError(null);
  };

  const handleSwitchAccount = () => {
    handleDisconnect().then(() => handleConnect());
  };

  const handleStartDiagnosis = async () => {
    const list = accounts.length > 0 ? accounts : await fetchAccounts();
    if (!list || list.length === 0) return;
    const id = selectedAccount || list[0].id;
    await runDiagnosis(id);
  };

  const handleRefresh = async () => {
    if (!selectedAccount) return;
    await runDiagnosis(selectedAccount, true);
  };

  /* ─ Render ─────────────────────────────────────────────────── */

  const inProgress =
    phase === "fetching_accounts" ||
    phase === "fetching_insights" ||
    phase === "diagnosing";

  if (status === null) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-5 h-5 animate-spin text-muted" />
      </div>
    );
  }

  /* Not connected — show connect CTA */
  if (!status.connected) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-5">
          <div className="w-12 h-12 mx-auto rounded-full bg-foreground/5 flex items-center justify-center">
            <BarChart3Icon />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t("ads.connectTitle")}</h2>
            <p className="text-xs text-muted mt-1">{t("ads.connectSub")}</p>
          </div>
          <ul className="text-left text-xs text-muted space-y-1.5 max-w-md mx-auto">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
              <span>{t("ads.bullet1")}</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
              <span>{t("ads.bullet2")}</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
              <span>{t("ads.bullet3")}</span>
            </li>
          </ul>
          <button
            onClick={handleConnect}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90"
          >
            <Plug className="w-4 h-4" />
            {t("ads.connectCta")}
          </button>
          <p className="text-[10px] text-muted">{t("ads.connectNote")}</p>
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* Connected */
  return (
    <div className="space-y-6">
      {/* Header bar — account selector + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">
              {status.user_name ?? t("ads.connected")}
            </p>
            <p className="text-[10px] text-muted">
              {t("ads.connectedAs")} · Meta Ads
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {accounts.length > 0 && (
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              disabled={inProgress}
              className="px-3 py-1.5 rounded-full border border-border bg-background text-xs font-medium disabled:opacity-50"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          )}
          {phase === "done" ? (
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-background hover:bg-card text-xs font-medium"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t("ads.refresh")}
            </button>
          ) : (
            <button
              onClick={handleStartDiagnosis}
              disabled={inProgress}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {inProgress ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {t("ads.run")}
            </button>
          )}
          <button
            onClick={handleSwitchAccount}
            disabled={inProgress}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-muted hover:text-foreground"
          >
            {t("ads.switch")}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={inProgress}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-red-600 hover:bg-red-50"
          >
            <LogOut className="w-3.5 h-3.5" />
            {t("ads.disconnect")}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Idle empty state */}
      {phase === "idle" && !diagnosis && !error && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center space-y-3">
          <Sparkles className="w-6 h-6 mx-auto text-muted/40" />
          <p className="text-sm font-medium">{t("ads.idleHeadline")}</p>
          <p className="text-xs text-muted">{t("ads.idleSub")}</p>
        </div>
      )}

      {/* Loading stepper */}
      {inProgress && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
          <Loader2 className="w-6 h-6 mx-auto animate-spin text-foreground" />
          <p className="text-sm font-medium">
            {loadingStepKey ? t(loadingStepKey as never) : t("ads.starting")}
          </p>
          <p className="text-[11px] text-muted">{t("ads.loadingSub")}</p>
        </div>
      )}

      {/* Results */}
      {diagnosis && phase === "done" && (
        <DiagnosisResults
          diagnosis={diagnosis}
          onGenerateInStudio={() => {
            // Hand off the generation_prompt to /marketing/static via URL param.
            // The page can pre-fill its prompt field from this.
            const params = new URLSearchParams({
              prompt: diagnosis.generation_prompt,
            });
            router.push(`/marketing/static?${params.toString()}`);
          }}
        />
      )}
    </div>
  );
}

/* ─── Results subcomponent ─────────────────────────────────────── */

function DiagnosisResults({
  diagnosis,
  onGenerateInStudio,
}: {
  diagnosis: Diagnosis;
  onGenerateInStudio: () => void;
}) {
  const { t } = useI18n();
  const formatClass = useMemo(
    () => FORMAT_BADGE[diagnosis.next_campaign.format] ?? FORMAT_BADGE.Reel,
    [diagnosis.next_campaign.format]
  );

  return (
    <div className="space-y-5">
      {/* Account summary */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
          {t("ads.accountSummary")}
        </h3>
        <p className="text-sm text-foreground">{diagnosis.account_summary}</p>
      </div>

      {/* What's working / not working */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InsightCard
          title={t("ads.working")}
          tone="good"
          items={diagnosis.whats_working}
        />
        <InsightCard
          title={t("ads.notWorking")}
          tone="bad"
          items={diagnosis.whats_not_working}
        />
      </div>

      {/* Best campaign + best ad */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {diagnosis.best_campaign && (
          <div className="rounded-2xl border-l-4 border-blue-500 bg-card p-4 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600">
              {t("ads.bestCampaign")}
            </h4>
            <p className="text-sm font-semibold">{diagnosis.best_campaign.name}</p>
            <div className="flex gap-3 text-[11px] text-muted">
              <span>
                {t("ads.spend")} <strong className="text-foreground">{diagnosis.best_campaign.spend}</strong>
              </span>
              <span>
                ROAS <strong className="text-foreground">{diagnosis.best_campaign.roas}</strong>
              </span>
            </div>
            <p className="text-xs text-muted">{diagnosis.best_campaign.why}</p>
          </div>
        )}
        {diagnosis.best_ad && (
          <div className="rounded-2xl border-l-4 border-emerald-500 bg-card p-4 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600">
              {t("ads.bestAd")}
            </h4>
            <p className="text-sm font-semibold">{diagnosis.best_ad.name}</p>
            <div className="flex gap-3 text-[11px] text-muted">
              <span>
                CTR <strong className="text-foreground">{diagnosis.best_ad.ctr}</strong>
              </span>
              <span>
                ROAS <strong className="text-foreground">{diagnosis.best_ad.roas}</strong>
              </span>
            </div>
            <p className="text-xs text-muted">{diagnosis.best_ad.why}</p>
          </div>
        )}
      </div>

      {/* Budget recommendation */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {t("ads.budgetRec")}
        </h3>
        <p className="text-sm font-semibold">{diagnosis.budget_recommendation.action}</p>
        <p className="text-xs text-muted">{diagnosis.budget_recommendation.rationale}</p>
      </div>

      {/* Next campaign blueprint */}
      <div className="rounded-2xl border border-foreground/20 bg-card p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold">{t("ads.nextCampaign")}</h3>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${formatClass}`}>
            {diagnosis.next_campaign.format}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Field label={t("ads.objective")} value={diagnosis.next_campaign.objective} />
          <Field label={t("ads.audience")} value={diagnosis.next_campaign.audience} />
          <Field label={t("ads.budget")} value={diagnosis.next_campaign.budget} />
          <Field label={t("ads.hook")} value={diagnosis.next_campaign.hook} />
        </div>
        <p className="text-xs text-muted">{diagnosis.next_campaign.rationale}</p>
        <button
          onClick={onGenerateInStudio}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-foreground text-background text-xs font-semibold hover:opacity-90"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {t("ads.generateInStudio")}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function InsightCard({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "good" | "bad";
  items: Insight[];
}) {
  const borderClass = tone === "good" ? "border-green-500" : "border-red-500";
  const titleClass = tone === "good" ? "text-green-600" : "text-red-600";
  return (
    <div className={`rounded-2xl border-l-4 ${borderClass} bg-card p-4 space-y-3`}>
      <h4 className={`text-xs font-bold uppercase tracking-wider ${titleClass}`}>{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-muted">—</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="text-xs">
              <p>{it.insight}</p>
              <p className="text-[10px] text-muted mt-0.5 italic">{it.evidence}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Small bespoke icon for the Connect card ──────────────────── */
function BarChart3Icon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 16V8" />
      <path d="M12 16v-4" />
      <path d="M17 16V4" />
    </svg>
  );
}
