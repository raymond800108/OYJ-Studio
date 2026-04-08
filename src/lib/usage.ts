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
  "camera-generate": { service: "fal", model: "qwen-image-edit-2509-lora", costUsd: 0.03 },
  "inpaint": { service: "fal", model: "flux-lora-inpainting", costUsd: 0.04 },
  "upload": { service: "fal", model: "storage", costUsd: 0 },
  "image-generate": { service: "kie", model: "nano-banana-2", costUsd: 0.04 },
  "video-generate": { service: "kie", model: "kling-2.6", costUsd: 0.30 },
  "3d-generate": { service: "meshy", model: "meshy-6", costUsd: 0.20 },
  "analyze-jewelry": { service: "openai", model: "gpt-4o", costUsd: 0.01 },
  "analyze-character": { service: "openai", model: "gpt-4o", costUsd: 0.02 },
  "analyze-outfit": { service: "openai", model: "gpt-4o", costUsd: 0.02 },
  "estimate": { service: "openai", model: "gpt-4o", costUsd: 0.015 },
};

/* ─── localStorage fallback ─────────────────────────────────────── */

const LOCAL_KEY = "ce-usage";

function loadLocal(): UsageEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocal(entries: UsageEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(entries.slice(0, 500)));
  } catch { /* ignore */ }
}

/* ─── Hook ──────────────────────────────────────────────────────── */

export function useUsageTracking() {
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [kvAvailable, setKvAvailable] = useState<boolean | null>(null);
  const fetchedRef = useRef(false);

  // On mount: fetch from server, fall back to localStorage
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    (async () => {
      try {
        const res = await fetch("/api/usage");
        const data = await res.json();

        if (data.source === "kv" && Array.isArray(data.entries)) {
          // KV entries come back as JSON strings — parse them
          const parsed: UsageEntry[] = data.entries.map((e: string | UsageEntry) =>
            typeof e === "string" ? JSON.parse(e) : e
          );
          setEntries(parsed);
          setKvAvailable(true);
          // Also sync to localStorage as cache
          saveLocal(parsed);
        } else {
          // KV not configured — use localStorage
          setKvAvailable(false);
          setEntries(loadLocal());
        }
      } catch {
        // Network error — use localStorage
        setKvAvailable(false);
        setEntries(loadLocal());
      }
    })();
  }, []);

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
        saveLocal(next);
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
    []
  );

  const clearUsage = useCallback(() => {
    setEntries([]);
    saveLocal([]);
    // Clear server data too
    fetch("/api/usage", { method: "DELETE" }).catch(() => {});
  }, []);

  // Refresh from server (for manual refresh)
  const refreshFromServer = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      const data = await res.json();
      if (data.source === "kv" && Array.isArray(data.entries)) {
        const parsed: UsageEntry[] = data.entries.map((e: string | UsageEntry) =>
          typeof e === "string" ? JSON.parse(e) : e
        );
        setEntries(parsed);
        saveLocal(parsed);
        setKvAvailable(true);
      }
    } catch {
      // keep current data
    }
  }, []);

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
