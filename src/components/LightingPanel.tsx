"use client";

import {
  Sun,
  SunDim,
  Sunset,
  Sunrise,
  Lightbulb,
  Moon,
  Flame,
  Zap,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Focus,
  Sparkles,
  CloudSun,
  RotateCcw,
} from "lucide-react";
import { useI18n, TKey } from "@/lib/i18n";

// ── Types ────────────────────────────────────────────────────────────────
export type LightingStyle =
  | "natural"
  | "studio"
  | "golden_hour"
  | "blue_hour"
  | "dramatic"
  | "soft"
  | "hard"
  | "backlight"
  | "side_light"
  | "front_light"
  | "rim_light"
  | "sunset"
  | "sunrise"
  | "neon"
  | "candlelight"
  | "moonlight"
  | "spotlight"
  | "ambient";

interface LightingPanelProps {
  lightingStyle: LightingStyle;
  onStyleChange: (s: LightingStyle) => void;
  disabled?: boolean;
}

// ── Presets ───────────────────────────────────────────────────────────────
const LIGHTING_PRESETS: {
  key: LightingStyle;
  labelKey: TKey;
  icon: typeof Sun;
}[] = [
  { key: "natural", labelKey: "light.natural", icon: Sun },
  { key: "studio", labelKey: "light.studioSoft", icon: SunDim },
  { key: "golden_hour", labelKey: "light.goldenHour", icon: Sunset },
  { key: "blue_hour", labelKey: "light.blueHour", icon: CloudSun },
  { key: "dramatic", labelKey: "light.dramatic", icon: Zap },
  { key: "soft", labelKey: "light.soft", icon: SunDim },
  { key: "hard", labelKey: "light.hard", icon: Sun },
  { key: "backlight", labelKey: "light.backlight", icon: ArrowUp },
  { key: "side_light", labelKey: "light.sideLight", icon: ArrowLeft },
  { key: "front_light", labelKey: "light.frontLight", icon: ArrowRight },
  { key: "rim_light", labelKey: "light.rimLight", icon: Sparkles },
  { key: "sunset", labelKey: "light.sunset", icon: Sunset },
  { key: "sunrise", labelKey: "light.sunrise", icon: Sunrise },
  { key: "neon", labelKey: "light.neonAccent", icon: Lightbulb },
  { key: "candlelight", labelKey: "light.candlelight", icon: Flame },
  { key: "moonlight", labelKey: "light.moonlight", icon: Moon },
  { key: "spotlight", labelKey: "light.spotlight", icon: Focus },
  { key: "ambient", labelKey: "light.ambient", icon: CloudSun },
];

// ── Component ────────────────────────────────────────────────────────────
export default function LightingPanel({
  lightingStyle,
  onStyleChange,
  disabled = false,
}: LightingPanelProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      {/* Lighting Style */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
          {t("light.style")}
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          {LIGHTING_PRESETS.map(({ key, labelKey, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onStyleChange(key)}
              disabled={disabled}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                lightingStyle === key
                  ? "bg-foreground text-background border-foreground shadow-sm"
                  : "bg-card text-muted border-border hover:border-foreground/20 hover:text-foreground"
              } disabled:opacity-40`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={() => onStyleChange("natural")}
        disabled={disabled}
        className="px-2 py-1 rounded-md text-[11px] text-muted hover:text-foreground disabled:opacity-40"
      >
        <RotateCcw className="w-3 h-3 inline mr-0.5" />
        {t("light.reset")}
      </button>
    </div>
  );
}
