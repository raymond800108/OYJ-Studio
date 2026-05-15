"use client";

import { useState } from "react";
import UsagePanel from "@/components/UsagePanel";
import { useAuth } from "@/lib/useAuth";
import { useUsageTracking } from "@/lib/usage";
import { useI18n } from "@/lib/i18n";

export default function UsagePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"self" | "all" | string>("self");
  const { entries, clearUsage, summary, kvAvailable, refreshFromServer } =
    useUsageTracking(user?.email, viewMode);

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
        {t("usage.title")}
      </h2>
      <UsagePanel
        entries={entries}
        summary={summary}
        onClear={clearUsage}
        kvAvailable={kvAvailable}
        onRefresh={refreshFromServer}
        userEmail={user?.email}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
    </div>
  );
}
