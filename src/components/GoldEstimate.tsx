"use client";

import { useState, useMemo } from "react";
import { AlertTriangle, AlertCircle, CheckCircle, ChevronDown, ChevronUp, Gem } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface BboxMm {
  x: number;
  y: number;
  z: number;
}

interface GoldEstimateProps {
  bboxMm: BboxMm | null;
}

// Gold densities in g/cm³
const GOLD_DENSITY: Record<string, number> = {
  "18K": 15.5,
  "14K": 13.4,
};

// Default gold price per gram in TWD for each karat
const DEFAULT_GOLD_PRICE: Record<string, number> = {
  "18K": 2400,
  "14K": 1900,
};

const LABOR_RATE = 0.35;
const OVERHEAD_RATE = 0.18;
const MARKETING_RATE = 0.12;
const PROFIT_RATE = 0.30;

// Manufacturability thresholds in grams
const MIN_REALISTIC = 0.5;
const MIN_FEASIBLE = 1.5;

export default function GoldEstimate({ bboxMm }: GoldEstimateProps) {
  const { lang } = useI18n();
  const zh = lang === "zh";

  const [karat, setKarat] = useState<"18K" | "14K">("18K");
  const [goldPrice, setGoldPrice] = useState(DEFAULT_GOLD_PRICE["18K"]);
  const [fillFactor, setFillFactor] = useState(0.25);
  const [stonePriceInput, setStonePriceInput] = useState("");
  const [showDetails, setShowDetails] = useState(true);

  const stonePriceTwd = parseFloat(stonePriceInput) || 0;

  const calc = useMemo(() => {
    if (!bboxMm) return null;
    const volumeMm3 = bboxMm.x * bboxMm.y * bboxMm.z;
    const volumeCm3 = volumeMm3 / 1000;
    const density = GOLD_DENSITY[karat];
    const goldWeightG = volumeCm3 * fillFactor * density;

    const metalCost = goldWeightG * goldPrice;
    const laborCost = metalCost * LABOR_RATE;
    const craftSubtotal = metalCost + stonePriceTwd + laborCost;
    const overheadCost = craftSubtotal * OVERHEAD_RATE;
    const marketingCost = craftSubtotal * MARKETING_RATE;
    const beforeProfit = craftSubtotal + overheadCost + marketingCost;
    const profitCost = beforeProfit * PROFIT_RATE;
    const total = beforeProfit + profitCost;

    const feasibility: "infeasible" | "borderline" | "feasible" =
      goldWeightG < MIN_REALISTIC
        ? "infeasible"
        : goldWeightG < MIN_FEASIBLE
        ? "borderline"
        : "feasible";

    return { volumeCm3, goldWeightG, metalCost, laborCost, craftSubtotal, overheadCost, marketingCost, profitCost, total, feasibility };
  }, [bboxMm, karat, goldPrice, fillFactor, stonePriceTwd]);

  const handleKaratChange = (k: "18K" | "14K") => {
    setKarat(k);
    setGoldPrice(DEFAULT_GOLD_PRICE[k]);
  };

  const fmt = (n: number) => Math.round(n).toLocaleString();

  return (
    <div className="p-5 rounded-2xl bg-white border border-border shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Gem className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground">
          {zh ? "黃金珠寶估價" : "Gold Jewelry Estimate"}
        </h3>
      </div>

      {!bboxMm ? (
        <p className="text-xs text-muted leading-relaxed">
          {zh
            ? "請先在 3D 模型校準面板中套用實際尺寸（mm），以啟用金重與金價估算功能。"
            : "Apply calibration in the 3D model panel first to enable gold weight and price estimation."}
        </p>
      ) : (
        <>
          {/* Karat selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted flex-shrink-0">{zh ? "純度：" : "Karat:"}</span>
            {(["18K", "14K"] as const).map((k) => (
              <button
                key={k}
                onClick={() => handleKaratChange(k)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  karat === k
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-card border-border text-muted hover:border-amber-300"
                }`}
              >
                {k} {zh ? "金" : "Gold"}
              </button>
            ))}
          </div>

          {/* Gold price slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted">{zh ? "黃金單價（TWD/g）" : "Gold Price (TWD/g)"}</span>
              <span className="text-xs font-mono font-semibold text-amber-600">
                NT${fmt(goldPrice)}/g
              </span>
            </div>
            <input
              type="range"
              min={800}
              max={5000}
              step={50}
              value={goldPrice}
              onChange={(e) => setGoldPrice(parseFloat(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-muted/60">
              <span>NT$800</span>
              <span>NT$5,000</span>
            </div>
          </div>

          {/* Fill factor slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted">{zh ? "填充率（實心比例）" : "Fill Factor (Solid Ratio)"}</span>
              <span className="text-xs font-mono font-semibold">{Math.round(fillFactor * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.05}
              max={0.80}
              step={0.01}
              value={fillFactor}
              onChange={(e) => setFillFactor(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted/60">
              <span>{zh ? "5% 空心" : "5% Hollow"}</span>
              <span>{zh ? "80% 實心" : "80% Solid"}</span>
            </div>
            <p className="text-[10px] text-muted/60 italic">
              {zh
                ? "參考值：戒指 40–60%、吊墜 15–30%、空心件 5–15%"
                : "Ref: ring 40–60%, pendant 15–30%, hollow 5–15%"}
            </p>
          </div>

          {/* Dimensions & weight summary */}
          {calc && (
            <div className="px-3 py-2 rounded-lg bg-card border border-border text-[11px] font-mono text-muted leading-relaxed">
              {zh ? "外框：" : "Bbox: "}
              {bboxMm.x.toFixed(1)} × {bboxMm.y.toFixed(1)} × {bboxMm.z.toFixed(1)} mm
              &ensp;|&ensp;
              {zh ? "體積：" : "Vol: "}
              {calc.volumeCm3.toFixed(3)} cm³
              &ensp;|&ensp;
              {zh ? "估計金重：" : "Est. gold: "}
              <span className="font-bold text-foreground">{calc.goldWeightG.toFixed(2)} g</span>
            </div>
          )}

          {/* Manufacturability assessment */}
          {calc?.feasibility === "infeasible" && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-700">
                  {zh ? "製造不可行" : "Not Manufacturable"}
                </p>
                <p className="text-[11px] text-red-600 mt-0.5 leading-relaxed">
                  {zh
                    ? `估計金重僅 ${calc.goldWeightG.toFixed(2)} g，過輕無法製作成首飾。請提高填充率或重新校準 3D 尺寸。`
                    : `Estimated ${calc.goldWeightG.toFixed(2)} g is too light for jewelry. Increase fill factor or recalibrate.`}
                </p>
              </div>
            </div>
          )}
          {calc?.feasibility === "borderline" && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-700">
                  {zh ? "重量偏輕，請確認" : "Very Light — Verify"}
                </p>
                <p className="text-[11px] text-amber-600 mt-0.5 leading-relaxed">
                  {zh
                    ? `估計金重 ${calc.goldWeightG.toFixed(2)} g，屬超輕量首飾（如薄片吊墜）。請確認填充率設定正確。`
                    : `Estimated ${calc.goldWeightG.toFixed(2)} g is very light (e.g. thin pendant). Verify fill factor.`}
                </p>
              </div>
            </div>
          )}
          {calc?.feasibility === "feasible" && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <p className="text-[11px] text-emerald-700 font-medium">
                {zh
                  ? `金重 ${calc.goldWeightG.toFixed(2)} g，製造可行`
                  : `${calc.goldWeightG.toFixed(2)} g — manufacturable`}
              </p>
            </div>
          )}

          {/* Stone/gem price input */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted flex-shrink-0">
              {zh ? "石頭 / 寶石費用：" : "Stone / Gem Cost:"}
            </span>
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">
                NT$
              </span>
              <input
                type="number"
                min={0}
                step={100}
                placeholder="0"
                value={stonePriceInput}
                onChange={(e) => setStonePriceInput(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-card border border-border text-xs text-right focus:outline-none focus:border-amber-300 focus:ring-1 focus:ring-amber-200 transition-all"
              />
            </div>
            <span className="text-[10px] text-muted flex-shrink-0">
              {zh ? "（手動輸入）" : "(manual)"}
            </span>
          </div>

          {/* Detailed breakdown */}
          {calc && (
            <div>
              <button
                onClick={() => setShowDetails((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 hover:text-foreground transition-colors mb-2"
              >
                {showDetails ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
                {zh ? "詳細估價明細" : "Detailed Breakdown"}
              </button>

              {showDetails && (
                <div className="text-xs border border-border rounded-xl overflow-hidden divide-y divide-border">
                  {/* Material section header */}
                  <div className="bg-card/80 px-3 py-1.5">
                    <p className="font-semibold text-[10px] uppercase tracking-wider text-muted">
                      {zh ? "珠寶材料" : "Jewelry Materials"}
                    </p>
                  </div>
                  <div className="px-3 py-2 space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted truncate">
                        {zh
                          ? `金屬材料（${karat} × ${calc.goldWeightG.toFixed(2)} g × NT$${fmt(goldPrice)}/g）`
                          : `Metal (${karat} × ${calc.goldWeightG.toFixed(2)} g × NT$${fmt(goldPrice)}/g)`}
                      </span>
                      <span className="font-mono font-medium text-foreground flex-shrink-0">
                        NT${fmt(calc.metalCost)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">
                        {zh ? "石頭 / 寶石（手動）" : "Stone / Gem (manual)"}
                      </span>
                      <span className="font-mono font-medium text-foreground">
                        NT${fmt(stonePriceTwd)}
                      </span>
                    </div>
                  </div>

                  {/* Craft section header */}
                  <div className="bg-card/80 px-3 py-1.5">
                    <p className="font-semibold text-[10px] uppercase tracking-wider text-muted">
                      {zh ? "工藝與服務" : "Craft & Service"}
                    </p>
                  </div>
                  <div className="px-3 py-2">
                    <div className="flex justify-between">
                      <span className="text-muted">
                        {zh
                          ? `工藝人工費（${Math.round(LABOR_RATE * 100)}%）`
                          : `Labor (${Math.round(LABOR_RATE * 100)}%)`}
                      </span>
                      <span className="font-mono font-medium text-foreground">
                        NT${fmt(calc.laborCost)}
                      </span>
                    </div>
                  </div>

                  {/* Subtotal */}
                  <div className="flex justify-between px-3 py-2 bg-card/50">
                    <span className="font-semibold text-foreground">{zh ? "小計" : "Subtotal"}</span>
                    <span className="font-mono font-semibold text-foreground">
                      NT${fmt(calc.craftSubtotal)}
                    </span>
                  </div>

                  {/* Operating costs header */}
                  <div className="bg-card/80 px-3 py-1.5">
                    <p className="font-semibold text-[10px] uppercase tracking-wider text-muted">
                      {zh ? "營運成本" : "Operating Costs"}
                    </p>
                  </div>
                  <div className="px-3 py-2 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted">
                        {zh
                          ? `管理費用（${Math.round(OVERHEAD_RATE * 100)}%）`
                          : `Overhead (${Math.round(OVERHEAD_RATE * 100)}%)`}
                      </span>
                      <span className="font-mono font-medium text-foreground">
                        NT${fmt(calc.overheadCost)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">
                        {zh
                          ? `行銷費用（${Math.round(MARKETING_RATE * 100)}%）`
                          : `Marketing (${Math.round(MARKETING_RATE * 100)}%)`}
                      </span>
                      <span className="font-mono font-medium text-foreground">
                        NT${fmt(calc.marketingCost)}
                      </span>
                    </div>
                  </div>

                  {/* Profit */}
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted">
                      {zh
                        ? `利潤（${Math.round(PROFIT_RATE * 100)}%）`
                        : `Profit Margin (${Math.round(PROFIT_RATE * 100)}%)`}
                    </span>
                    <span className="font-mono font-medium text-foreground">
                      NT${fmt(calc.profitCost)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Total */}
          {calc && (
            <div className="flex items-center justify-between p-4 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-sm font-bold text-amber-800">
                {zh ? "總估價" : "Total Estimate"}
              </span>
              <span className="text-lg font-bold text-amber-700 font-mono">
                NT${fmt(calc.total)}
              </span>
            </div>
          )}

          <p className="text-[10px] text-muted/50 italic">
            {zh
              ? "* 估算基於 3D 模型外框體積與填充率推算，僅供參考。實際重量依設計而異。"
              : "* Estimate based on 3D bounding box volume × fill factor. Actual weight varies by design."}
          </p>
        </>
      )}
    </div>
  );
}
