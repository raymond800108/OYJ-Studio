"use client";

import { RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface CameraControlsProps {
  horizontalAngle: number;   // 0-360°
  verticalAngle: number;     // -30 to 90°
  zoom: number;              // 0-10
  onRotateChange: (v: number) => void;
  onMoveForwardChange: (v: number) => void;
  onVerticalAngleChange: (v: number) => void;
  disabled?: boolean;
}

const COLOR = {
  azimuth: "#06b6d4",
  elevation: "#ec4899",
  distance: "#f59e0b",
} as const;

/* ─── Styled slider ────────────────────────────────────────────── */
function ColorSlider({
  label,
  description,
  value,
  min,
  max,
  step,
  color,
  onChange,
  onReset,
  resetValue,
  disabled,
  unit = "",
  formatValue,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  color: string;
  onChange: (v: number) => void;
  onReset: () => void;
  resetValue: number;
  disabled?: boolean;
  unit?: string;
  formatValue?: (v: number) => string;
}) {
  const displayValue = formatValue ? formatValue(value) : `${value}`;
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="px-3 py-1 rounded-full text-[11px] font-bold text-white tracking-wide"
          style={{ backgroundColor: color }}>
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center min-w-[44px] px-2 py-1 rounded-lg bg-stone-100 border border-stone-200 text-xs font-mono font-semibold text-foreground tabular-nums">
            {displayValue}{unit}
          </span>
          {value !== resetValue && (
            <button onClick={onReset} disabled={disabled}
              className="p-1 rounded-md text-stone-400 hover:text-foreground hover:bg-stone-100 transition-colors disabled:opacity-40"
              title="Reset">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <p className="text-[10px] text-stone-400 font-medium tracking-wide">{description}</p>

      <div className="relative pt-1 pb-1">
        <div className="relative h-2 rounded-full bg-stone-200 overflow-hidden">
          <div className="absolute top-0 left-0 h-full rounded-full transition-all"
            style={{ width: `${percentage}%`, backgroundColor: color, opacity: 0.7 }} />
        </div>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          disabled={disabled}
          className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          style={{ height: "24px", marginTop: "-8px" }} />
        <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `calc(${percentage}% - 8px)` }}>
          <div className="w-4 h-4 rounded-full border-[2.5px] border-white shadow-md"
            style={{ backgroundColor: color }} />
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-stone-400 font-mono">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

/* ─── Prompt preview ───────────────────────────────────────────── */
function generatePromptPreview(h: number, v: number, z: number): string {
  // Azimuth (8 positions at 45° intervals)
  let azimuth: string;
  const norm = ((h % 360) + 360) % 360;
  if (norm < 23 || norm >= 338) azimuth = "front view";
  else if (norm < 68) azimuth = "front-right quarter view";
  else if (norm < 113) azimuth = "right side view";
  else if (norm < 158) azimuth = "back-right quarter view";
  else if (norm < 203) azimuth = "back view";
  else if (norm < 248) azimuth = "back-left quarter view";
  else if (norm < 293) azimuth = "left side view";
  else azimuth = "front-left quarter view";

  // Elevation (4 positions)
  let elevation: string;
  if (v <= -15) elevation = "low-angle shot";
  else if (v <= 15) elevation = "eye-level shot";
  else if (v <= 45) elevation = "elevated shot";
  else elevation = "high-angle shot";

  // Distance (3 positions)
  let distance: string;
  if (z <= 3) distance = "close-up";
  else if (z <= 7) distance = "medium shot";
  else distance = "wide shot";

  return `<sks> ${azimuth} ${elevation} ${distance}`;
}

/* ─── Main component ──────────────────────────────────────────── */
export default function CameraControls({
  horizontalAngle,
  verticalAngle,
  zoom,
  onRotateChange,
  onMoveForwardChange,
  onVerticalAngleChange,
  disabled,
}: CameraControlsProps) {
  const { t } = useI18n();
  const promptPreview = generatePromptPreview(horizontalAngle, verticalAngle, zoom);

  return (
    <div className="rounded-2xl border border-border bg-white p-5 space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-base">🎚</span>
        <h3 className="text-sm font-bold text-foreground">{t("controls.fineTune")}</h3>
      </div>

      <ColorSlider
        label={t("controls.horizontalAngle")}
        description="0°=front, 90°=right, 180°=back, 270°=left, 360°=front"
        value={horizontalAngle}
        min={0}
        max={355}
        step={5}
        color={COLOR.azimuth}
        onChange={onRotateChange}
        onReset={() => onRotateChange(0)}
        resetValue={0}
        disabled={disabled}
        unit="°"
        formatValue={(v) => `${v}`}
      />

      <ColorSlider
        label={t("controls.verticalAngle")}
        description="-30°=low angle, 0°=eye level, 30°=elevated, 60°=high angle"
        value={verticalAngle}
        min={-30}
        max={90}
        step={5}
        color={COLOR.elevation}
        onChange={onVerticalAngleChange}
        onReset={() => onVerticalAngleChange(0)}
        resetValue={0}
        disabled={disabled}
        unit="°"
        formatValue={(v) => `${v}`}
      />

      <ColorSlider
        label={t("controls.zoom")}
        description="0=close-up, 5=medium shot, 10=wide shot"
        value={zoom}
        min={0}
        max={10}
        step={0.5}
        color={COLOR.distance}
        onChange={onMoveForwardChange}
        onReset={() => onMoveForwardChange(5)}
        resetValue={5}
        disabled={disabled}
        formatValue={(v) => v.toFixed(1)}
      />

      {/* Generated Prompt Preview */}
      <div className="space-y-1.5">
        <span className="px-3 py-1 rounded-full text-[11px] font-bold text-white bg-stone-500 tracking-wide">
          Generated Prompt
        </span>
        <div className="mt-2 px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-200">
          <code className="text-xs font-mono text-stone-600">{promptPreview}</code>
        </div>
      </div>
    </div>
  );
}
