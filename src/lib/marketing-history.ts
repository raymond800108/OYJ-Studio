"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { HistoryItem } from "@/components/HistoryPanel";

/**
 * Shared marketing-tools history store.
 *
 * - Single source of truth: localStorage["convra-history"]
 * - Same-tab broadcast: window event `convra-history-changed`
 * - Cross-tab broadcast: native `storage` event
 *
 * Selection (clicking a history item to reuse as source) flows through
 * the `convra-history-select` event so each subpage can listen
 * independently and update its own source-image state.
 */

const STORAGE_KEY = "convra-history";
const CHANGED_EVENT = "convra-history-changed";
const SELECT_EVENT = "convra-history-select";

interface SelectDetail {
  url: string;
  mode?: HistoryItem["mode"];
}

function readStorage(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

function writeStorage(items: HistoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
  } catch {
    // ignore quota errors
  }
}

/** Append a new history entry. Capped at 100 entries to prevent unbounded growth. */
export function appendHistory(item: HistoryItem) {
  const current = readStorage();
  const next = [item, ...current.filter((i) => i.id !== item.id)].slice(0, 100);
  writeStorage(next);
}

/** Replace the full history (used by Clear). */
export function clearHistory() {
  writeStorage([]);
}

/** Fire a select event so subpages can capture an item as their input. */
export function selectFromHistory(url: string, mode?: HistoryItem["mode"]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SelectDetail>(SELECT_EVENT, { detail: { url, mode } }));
}

/** Subscribe a callback to selection events. Returns the cleanup fn. */
export function onHistorySelect(cb: (detail: SelectDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<SelectDetail>).detail;
    if (detail) cb(detail);
  };
  window.addEventListener(SELECT_EVENT, handler);
  return () => window.removeEventListener(SELECT_EVENT, handler);
}

/* ─── React subscription hook ─────────────────────────────────────── */

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGED_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGED_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

// Stable empty array reference for SSR snapshot so useSyncExternalStore
// doesn't loop on identity mismatch.
const EMPTY: HistoryItem[] = [];

// Cache the parsed snapshot keyed by raw JSON string. useSyncExternalStore
// calls getSnapshot on every render; returning a fresh array each time
// triggers an infinite render loop ("The result of getSnapshot should be
// cached"). We only re-parse when the underlying string actually changes.
let cachedRaw: string | null = null;
let cachedItems: HistoryItem[] = EMPTY;

function getSnapshot(): HistoryItem[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedItems;
  cachedRaw = raw;
  try {
    cachedItems = raw ? (JSON.parse(raw) as HistoryItem[]) : EMPTY;
  } catch {
    cachedItems = EMPTY;
  }
  return cachedItems;
}
function getServerSnapshot(): HistoryItem[] {
  return EMPTY;
}

/** Reactive list of history items, kept in sync with localStorage. */
export function useMarketingHistory(): HistoryItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Convenience hook for a subpage: subscribes to history-select events and
 * exposes the latest selected url (resets to null after consumption — caller
 * can use it directly to setSourceUrl, etc.).
 */
export function useHistorySelection(onSelect: (url: string, mode?: HistoryItem["mode"]) => void) {
  // Wrap caller in a ref-free effect so the latest handler is always called.
  useEffect(() => onHistorySelect((d) => onSelect(d.url, d.mode)), [onSelect]);
}

/** Hook that returns just the latest selected url (auto-set on click). */
export function useLatestSelectedHistoryUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(
    () =>
      onHistorySelect((d) => {
        setUrl(d.url);
      }),
    []
  );
  return url;
}
