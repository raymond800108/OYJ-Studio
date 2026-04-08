"use client";

import { Loader2, Package, DollarSign } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface Estimation {
  product_name: string;
  materials: string[];
  material_analysis: string;
  unit_cost_twd: { low: number; high: number };
  unit_cost_usd: { low: number; high: number };
  batch_note: string;
  confidence: "low" | "medium" | "high";
}

interface PriceEstimateProps {
  estimation: Estimation | null;
  loading: boolean;
  error: string | null;
}

export default function PriceEstimate({
  estimation,
  loading,
  error,
}: PriceEstimateProps) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-border shadow-sm">
        <Loader2 className="w-4 h-4 animate-spin text-foreground" />
        <span className="text-sm text-muted">{t("price.analyzing")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-2xl bg-white border border-danger/20 shadow-sm">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (!estimation) return null;

  const confidenceColor = {
    low: "text-amber-600 bg-amber-50 border-amber-200",
    medium: "text-foreground bg-card-hover border-border",
    high: "text-emerald-700 bg-emerald-50 border-emerald-200",
  }[estimation.confidence];

  return (
    <div className="p-5 rounded-2xl bg-white border border-border shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">
            {t("price.title")}
          </h3>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${confidenceColor}`}
        >
          {estimation.confidence} {t("price.confidence")}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Package className="w-3.5 h-3.5 text-muted" />
        <span className="text-sm font-medium">{estimation.product_name}</span>
      </div>

      {/* Materials */}
      <div className="flex flex-wrap gap-1.5">
        {estimation.materials.map((m) => (
          <span
            key={m}
            className="px-2.5 py-1 rounded-full bg-card-hover border border-border text-[11px] font-medium text-foreground"
          >
            {m}
          </span>
        ))}
      </div>

      <p className="text-xs text-muted leading-relaxed">
        {estimation.material_analysis}
      </p>

      {/* Price range */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-background border border-border">
          <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
            {t("price.twdPerUnit")}
          </p>
          <p className="text-base font-semibold text-foreground">
            NT${estimation.unit_cost_twd.low.toLocaleString()} –{" "}
            {estimation.unit_cost_twd.high.toLocaleString()}
          </p>
        </div>
        <div className="p-3 rounded-xl bg-background border border-border">
          <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
            {t("price.usdPerUnit")}
          </p>
          <p className="text-base font-semibold text-foreground">
            ${estimation.unit_cost_usd.low.toLocaleString()} –{" "}
            {estimation.unit_cost_usd.high.toLocaleString()}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-muted/70 italic">
        {estimation.batch_note}
      </p>

      <p className="text-[10px] text-muted/50">
        {t("price.disclaimer")}
      </p>
    </div>
  );
}
