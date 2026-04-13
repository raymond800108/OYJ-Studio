"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/* ─── Types ─────────────────────────────────────────────────────── */

export type ApiService = "fal" | "kie" | "meshy" | "openai";
export type ApiAction =
  | "camera-generate"
  | "inpaint"
  | "upload"
  | "image-generate"
  | "video-generate"
  | "3d-generate"
  | "analyze-jewelry"
  | "analyze-character"
  | "analyze-outfit"
  | "relight"
  | "estimate";

export interface UsageEntry {
  id: string;
  timestamp: number;
  service: ApiService;
  action: ApiAction;
  model?: string;
  /** Estimated cost in USD */
  costUsd: number;
  /** For OpenAI: prompt + completion tokens */
  tokensIn?: number;
  tokensOut?: number;
  status: "success" | "error";
  detail?: string;
  /** User email — set server-side when saving to Redis */
  userEmail?: string;
}

export interface UsageSummary {
  totalCalls: number;
  totalCostUsd: number;
  totalTokensIn: number;
  totalTokensOut: number;
  byService: Record<ApiService, { calls: number; costUsd: number }>;
  byAction: Record<string, { calls: number; costUsd: number }>;
  last30Days: UsageEntry[];
}

/* ─── Approximate pricing per call ──────────────────────────────── */

export const PRICE_TABLE: Record<ApiAction, { service: ApiService; model: string; costUsd: number }> = {
  "camera-generate": { service: "fal", model: "qwen-image-edit-2511-multiple-angles", costUsd: 0.15 },
  "inpaint": { service: "fal", model: "flux-pro-v1-fill", costUsd: 0.50 },
  "upload": { service: "fal", model: "storage", costUsd: 0 },
  "image-generate": { service: "kie", model: "nano-banana-2", costUsd: 0.20 },
  "video-generate": { service: "kie", model: "kling-2.6", costUsd: 1.50 },
  "3d-generate": { service: "meshy", model: "meshy-6", costUsd: 1.00 },
  "analyze-jewelry": { service: "openai", model: "gpt-4o", costUsd: 0.05 },
  "analyze-character": { service: "openai", model: "gpt-4o", costUsd: 0.10 },
  "analyze-outfit": { service: "openai", model: "gpt-4o", costUsd: 0.10 },
  "relight": { service: "fal", model: "iclight-v2", costUsd: 0.10 },
  "estimate": { service: "openai", model: "gpt-4o", costUsd: 0.075 },
};

/* ─── localStorage fallback ─────────────────────────────────────── */

const LOCAL_KEY_BASE = "ce-usage";

function getLocalKey(userEmail?: string | null): string {
  const email = userEmail?.toLowerCase();
  return email ? `${LOCAL_KEY_BASE}:${email}` : `${LOCAL_KEY_BASE}:anon`;
}

function loadLocal(userEmail?: string | null): UsageEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getLocalKey(userEmail));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocal(entries: UsageEntry[], userEmail?: string | null) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getLocalKey(userEmail), JSON.stringify(entries.slice(0, 500)));
  } catch { /* ignore */ }
}

/* ─── Hook ──────────────────────────────────────────────────────── */

const ADMIN_EMAIL = "raymond800108@gmail.com";

/**
 * viewMode:
 *   "self"         → current user's own entries (default)
 *   "all"          → admin only: all users aggregated
 *   email string   → admin only: specific user's entries
 */
export function useUsageTracking(
  userEmail?: string | null,
  viewMode: "self" | "all" | string = "self"
) {
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [kvAvailable, setKvAvailable] = useState<boolean | null>(null);

  const isAdmin = userEmail?.toLowerCase() === ADMIN_EMAIL;
  // Non-admin is locked to "self"
  const effectiveMode = isAdmin ? viewMode : "self";
  const isAdminView = effectiveMode !== "self";

  // Refetch whenever user email or view mode changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let url = "/api/usage";
        if (effectiveMode === "all") {
          url = "/api/usage?scope=all";
        } else if (effectiveMode !== "self") {
          url = `/api/usage?scope=user&email=${encodeURIComponent(effectiveMode)}`;
        }
        const res = await fetch(url);
        const data = await res.json();

        if (cancelled) return;

        if (data.source === "kv" && Array.isArray(data.entries)) {
          const parsed: UsageEntry[] = data.entries.map((e: string | UsageEntry) =>
            typeof e === "string" ? JSON.parse(e) : e
          );
          setEntries(parsed);
          setKvAvailable(true);
          if (!isAdminView) saveLocal(parsed, userEmail);
        } else {
          setKvAvailable(false);
          setEntries(isAdminView ? [] : loadLocal(userEmail));
        }
      } catch {
        if (cancelled) return;
        setKvAvailable(false);
        setEntries(isAdminView ? [] : loadLocal(userEmail));
      }
    })();
    return () => { cancelled = true; };
  }, [userEmail, effectiveMode, isAdminView]);

  const logUsage = useCallback(
    (
      action: ApiAction,
      opts?: {
        status?: "success" | "error";
        tokensIn?: number;
        tokensOut?: number;
        costOverride?: number;
        detail?: string;
      }
    ) => {
      const price = PRICE_TABLE[action];
      const entry: UsageEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        service: price.service,
        action,
        model: price.model,
        costUsd: opts?.costOverride ?? price.costUsd,
        tokensIn: opts?.tokensIn,
        tokensOut: opts?.tokensOut,
        status: opts?.status ?? "success",
        detail: opts?.detail,
      };

      // Optimistic update
      setEntries((prev) => {
        const next = [entry, ...prev];
        saveLocal(next, userEmail);
        return next;
      });

      // Persist to server (fire-and-forget)
      fetch("/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      }).catch(() => {
        // Silently fail — localStorage has the data
      });

      return entry;
    },
    [userEmail]
  );

  const clearUsage = useCallback(() => {
    setEntries([]);
    if (!isAdminView) saveLocal([], userEmail);
    // Clear server data: for admin view a specific user, clear that user; for all, clear all; for self, clear self
    let url = "/api/usage";
    if (effectiveMode === "all") url = "/api/usage?scope=all";
    else if (effectiveMode !== "self") url = `/api/usage?scope=user&email=${encodeURIComponent(effectiveMode)}`;
    fetch(url, { method: "DELETE" }).catch(() => {});
  }, [userEmail, effectiveMode, isAdminView]);

  // Refresh from server (for manual refresh)
  const refreshFromServer = useCallback(async () => {
    try {
      let url = "/api/usage";
      if (effectiveMode === "all") url = "/api/usage?scope=all";
      else if (effectiveMode !== "self") url = `/api/usage?scope=user&email=${encodeURIComponent(effectiveMode)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.source === "kv" && Array.isArray(data.entries)) {
        const parsed: UsageEntry[] = data.entries.map((e: string | UsageEntry) =>
          typeof e === "string" ? JSON.parse(e) : e
        );
        setEntries(parsed);
        if (!isAdminView) saveLocal(parsed, userEmail);
        setKvAvailable(true);
      }
    } catch {
      // keep current data
    }
  }, [userEmail, effectiveMode, isAdminView]);

  const summary: UsageSummary = computeSummary(entries);

  return { entries, logUsage, clearUsage, summary, kvAvailable, refreshFromServer };
}

/* ─── Summary computation ───────────────────────────────────────── */

function computeSummary(entries: UsageEntry[]): UsageSummary {
  const byService: Record<ApiService, { calls: number; costUsd: number }> = {
    fal: { calls: 0, costUsd: 0 },
    kie: { calls: 0, costUsd: 0 },
    meshy: { calls: 0, costUsd: 0 },
    openai: { calls: 0, costUsd: 0 },
  };
  const byAction: Record<string, { calls: number; costUsd: number }> = {};

  let totalCalls = 0;
  let totalCostUsd = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  for (const e of entries) {
    totalCalls++;
    totalCostUsd += e.costUsd;
    totalTokensIn += e.tokensIn ?? 0;
    totalTokensOut += e.tokensOut ?? 0;

    if (byService[e.service]) {
      byService[e.service].calls++;
      byService[e.service].costUsd += e.costUsd;
    }

    if (!byAction[e.action]) byAction[e.action] = { calls: 0, costUsd: 0 };
    byAction[e.action].calls++;
    byAction[e.action].costUsd += e.costUsd;
  }

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30Days = entries.filter((e) => e.timestamp >= thirtyDaysAgo);

  return { totalCalls, totalCostUsd, totalTokensIn, totalTokensOut, byService, byAction, last30Days };
}
