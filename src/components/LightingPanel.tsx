"use client";

import {
  Sun,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  SunDim,
} from "lucide-react";
import { useI18n, TKey } from "@/lib/i18n";

// ── Types ────────────────────────────────────────────────────────────────
export type LightDirection = "None" | "Left" | "Right" | "Top" | "Bottom";

interface LightingPanelProps {
  direction: LightDirection;
  onDirectionChange: (d: LightDirection) => void;
  guidanceScale: number;
  onGuidanceChange: (v: number) => void;
  prompt: string;
  onPromptChange: (v: string) => void;
  enableHrFix: boolean;
  onHrFixChange: (v: boolean) => void;
  disabled?: boolean;
}

// ── Presets ───────────────────────────────────────────────────────────────
const DIRECTION_PRESETS: {
  key: LightDirection;
  labelKey: TKey;
  icon: typeof Sun;
}[] = [
  { key: "None", labelKey: "light.auto", icon: SunDim },
  { key: "Left", labelKey: "light.left", icon: ArrowLeft },
  { key: "Right", labelKey: "light.right", icon: ArrowRight },
  { key: "Top", labelKey: "light.top", icon: ArrowUp },
  { key: "Bottom", labelKey: "light.bottom", icon: ArrowDown },
];

const SCENE_PRESETS: { labelKey: TKey; prompt: string }[] = [
  { labelKey: "light.goldenHour", prompt: "warm golden hour sunlight from the side, soft amber glow, long gentle shadows, professional product photography" },
  { labelKey: "light.studioSoft", prompt: "professional studio soft diffused lighting, clean white studio, even illumination, luxury product photography" },
  { labelKey: "light.dramaticSide", prompt: "dramatic single directional side light, strong contrast, deep shadows, moody luxury product photography" },
  { labelKey: "light.windowLight", prompt: "soft natural window light, gentle directional illumination, warm ambient fill, editorial product photography" },
  { labelKey: "light.neonAccent", prompt: "subtle neon accent lighting, cool blue and warm pink rim lights, contemporary fashion product photography" },
  { labelKey: "light.overhead", prompt: "overhead top-down lighting, defined shadows below, clean bright illumination, catalog product photography" },
];

// ── Component ────────────────────────────────────────────────────────────
export default function LightingPanel({
  direction,
  onDirectionChange,
  guidanceScale,
  onGuidanceChange,
  prompt,
  onPromptChange,
  enableHrFix,
  onHrFixChange,
  disabled = false,
}: LightingPanelProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      {/* Light Direction Presets */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
          {t("light.direction")}
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          {DIRECTION_PRESETS.map(({ key, labelKey, icon: Icon }) => (
            <button
              key={key}
              onClick={() => onDirectionChange(key)}
              disabled={disabled}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                direction === key
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

      {/* Visual Direction Indicator */}
      <div className="flex items-center justify-center">
        <div className="relative w-36 h-36 rounded-full border-2 border-border bg-card/50">
          {/* Center dot = subject */}
          <div className="absolute top-1/2 left-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full bg-foreground/30" />
          {/* Sun indicator */}
          {direction !== "None" && (
            <div
              className="absolute w-8 h-8 -mt-4 -ml-4 rounded-full bg-amber-400/90 shadow-lg shadow-amber-400/40 flex items-center justify-center transition-all duration-300"
              style={{
                top: direction === "Top" ? "10%" : direction === "Bottom" ? "90%" : "50%",
                left: direction === "Left" ? "10%" : direction === "Right" ? "90%" : "50%",
              }}
            >
              <Sun className="w-4 h-4 text-amber-900" />
            </div>
          )}
          {direction === "None" && (
            <div className="absolute top-1/2 left-1/2 -mt-3 -ml-3 w-6 h-6 rounded-full bg-amber-400/40 flex items-center justify-center">
              <SunDim className="w-3.5 h-3.5 text-amber-700/60" />
            </div>
          )}
          {/* Labels */}
          <span className="absolute top-1 left-1/2 -ml-4 text-[9px] text-muted">{t("light.top")}</span>
          <span className="absolute bottom-1 left-1/2 -ml-6 text-[9px] text-muted">{t("light.bottom")}</span>
          <span className="absolute left-1.5 top-1/2 -mt-1.5 text-[9px] text-muted">{t("light.left")}</span>
          <span className="absolute right-1 top-1/2 -mt-1.5 text-[9px] text-muted">{t("light.right")}</span>
        </div>
      </div>

      {/* Scene Presets */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
          {t("light.scenePresets")}
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          {SCENE_PRESETS.map((preset) => (
            <button
              key={preset.labelKey}
              onClick={() => onPromptChange(preset.prompt)}
              disabled={disabled}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all border ${
                prompt === preset.prompt
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-muted border-border hover:border-foreground/20 hover:text-foreground"
              } disabled:opacity-40`}
            >
              {t(preset.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt */}
      <div>
        <label className="text-xs font-medium text-foreground/80 mb-1.5 block">
          {t("light.description")}
        </label>
        <input
          type="text"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={t("light.descPlaceholder")}
          disabled={disabled}
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-40"
        />
      </div>

      {/* Guidance Scale Slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-foreground/80">
            {t("light.promptStrength")}
          </label>
          <span className="text-xs text-muted tabular-nums">{guidanceScale.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min={1}
          max={15}
          step={0.5}
          value={guidanceScale}
          onChange={(e) => onGuidanceChange(parseFloat(e.target.value))}
          disabled={disabled}
          className="w-full accent-foreground disabled:opacity-40"
        />
        <div className="flex justify-between text-[9px] text-muted/50 mt-0.5">
          <span>{t("light.subtle")}</span>
          <span>{t("light.strong")}</span>
        </div>
      </div>

      {/* HR Fix Toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enableHrFix}
          onChange={(e) => onHrFixChange(e.target.checked)}
          disabled={disabled}
          className="accent-foreground w-3.5 h-3.5"
        />
        <span className="text-xs text-foreground/80">{t("light.hrFix")}</span>
      </label>

      {/* Reset */}
      <button
        onClick={() => {
          onDirectionChange("None");
          onGuidanceChange(5);
          onPromptChange("");
          onHrFixChange(true);
        }}
        disabled={disabled}
        className="px-2 py-1 rounded-md text-[11px] text-muted hover:text-foreground disabled:opacity-40"
      >
        <RotateCcw className="w-3 h-3 inline mr-0.5" />
        {t("light.reset")}
      </button>
    </div>
  );
}
