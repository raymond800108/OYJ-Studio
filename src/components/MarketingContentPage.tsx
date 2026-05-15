"use client";

import { useState } from "react";
import MarketingPanel from "@/components/MarketingPanel";
import { HistoryItem } from "@/components/HistoryPanel";
import { useUsageTracking } from "@/lib/usage";
import { useAuth } from "@/lib/useAuth";
import { appendHistory, useHistorySelection } from "@/lib/marketing-history";

interface MarketingContentPageProps {
  contentType: "image" | "video";
}

/**
 * Standalone wrapper for the marketing image/video flow.
 * Local panel state + shared marketing history bridge.
 *
 * - Selecting an item from the shared MarketingHistoryStrip pushes its
 *   URL into MarketingPanel's source list (via `externalSourceUrl` +
 *   a bump counter so the same URL twice still triggers).
 * - Anything added to MarketingPanel's internal `history` is mirrored
 *   to the shared store so other subpages see it too.
 */
export default function MarketingContentPage({ contentType }: MarketingContentPageProps) {
  const { user } = useAuth();
  const { logUsage } = useUsageTracking(user?.email);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sharedResults, setSharedResults] = useState<string[]>([]);
  const [externalSourceUrl, setExternalSourceUrl] = useState<string | null>(null);

  // Bump key whenever a select fires so the effect inside MarketingPanel
  // re-runs even if user picks the same URL twice in a row.
  const [, setBumpKey] = useState(0);
  useHistorySelection((url) => {
    setExternalSourceUrl(url);
    setBumpKey((n) => n + 1);
  });

  return (
    <MarketingPanel
      history={history}
      onAddHistory={(item) => {
        setHistory((prev) => [item, ...prev.slice(0, 11)]);
        // Mirror to shared store so other marketing subpages see it.
        appendHistory(item);
      }}
      sharedResults={sharedResults}
      onSharedResults={setSharedResults}
      onLoadingChange={() => {}}
      onProgressChange={() => {}}
      otherPageLoading={false}
      otherPageMode=""
      onSwitchMode={() => {}}
      logUsage={logUsage}
      initialContentType={contentType}
      lockContentType
      externalSourceUrl={externalSourceUrl}
    />
  );
}
