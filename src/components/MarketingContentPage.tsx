"use client";

import { useState } from "react";
import MarketingPanel from "@/components/MarketingPanel";
import { HistoryItem } from "@/components/HistoryPanel";
import { useUsageTracking } from "@/lib/usage";
import { useAuth } from "@/lib/useAuth";

interface MarketingContentPageProps {
  contentType: "image" | "video";
}

/**
 * Standalone wrapper for the marketing image/video flow.
 * Local history + shared-results state (no cross-page sync).
 * Renders MarketingPanel with the toggle locked to a single content type.
 */
export default function MarketingContentPage({ contentType }: MarketingContentPageProps) {
  const { user } = useAuth();
  const { logUsage } = useUsageTracking(user?.email);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sharedResults, setSharedResults] = useState<string[]>([]);

  return (
    <MarketingPanel
      history={history}
      onAddHistory={(item) => setHistory((prev) => [item, ...prev.slice(0, 11)])}
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
    />
  );
}
