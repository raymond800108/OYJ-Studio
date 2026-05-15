"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import UsagePanel from "@/components/UsagePanel";
import { useAuth } from "@/lib/useAuth";
import { useUsageTracking } from "@/lib/usage";
import { useI18n } from "@/lib/i18n";

const AdminInvoiceHub = dynamic(() => import("@/components/AdminInvoiceHub"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[400px] rounded-2xl bg-card border border-border">
      <Loader2 className="w-5 h-5 animate-spin text-muted" />
    </div>
  ),
});

const ADMIN_EMAIL = "raymond800108@gmail.com";

export default function UsagePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<"self" | "all" | string>("self");
  const [subTab, setSubTab] = useState<"dashboard" | "invoices">("dashboard");
  const { entries, clearUsage, summary, kvAvailable, refreshFromServer } =
    useUsageTracking(user?.email, viewMode);

  const isAdminUser = user?.email?.toLowerCase() === ADMIN_EMAIL;

  // "Billed to" info for non-admin users
  const [myCompany, setMyCompany] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!user?.email || isAdminUser) {
      setMyCompany(null);
      return;
    }
    let cancelled = false;
    fetch("/api/me/company")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setMyCompany(d?.company ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.email, isAdminUser]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {t("usage.title")}
        </h2>
        {!isAdminUser && myCompany && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-card border border-border text-[11px]">
            <span className="text-muted">{t("invoice.billedTo" as import("@/lib/i18n").TKey)}</span>
            <span className="font-medium">{myCompany.name}</span>
          </div>
        )}
        {isAdminUser && (
          <div className="flex items-center gap-1 p-1 rounded-full bg-card border border-border">
            <button
              onClick={() => setSubTab("dashboard")}
              className={`px-3 py-1 rounded-full text-[11px] transition-colors ${
                subTab === "dashboard"
                  ? "bg-foreground text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t("invoice.usageDashboard" as import("@/lib/i18n").TKey)}
            </button>
            <button
              onClick={() => setSubTab("invoices")}
              className={`px-3 py-1 rounded-full text-[11px] transition-colors ${
                subTab === "invoices"
                  ? "bg-foreground text-background"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t("invoice.hub" as import("@/lib/i18n").TKey)}
            </button>
          </div>
        )}
      </div>

      {isAdminUser && subTab === "invoices" ? (
        <AdminInvoiceHub />
      ) : (
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
      )}
    </div>
  );
}
