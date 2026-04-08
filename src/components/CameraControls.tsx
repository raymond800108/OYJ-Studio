"use client";

import {
  RotateCcw,
  RotateCw,
  MoveHorizontal,
  MoveVertical,
  ZoomIn,
  ScanEye,
  RotateCcwSquare,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface CameraControlsProps {
  rotateRightLeft: number;
  moveForward: number;
  verticalAngle: number;
  wideAngle: boolean;
  onRotateChange: (v: number) => void;
  onMoveForwardChange: (v: number) => void;
  onVerticalAngleChange: (v: number) => void;
  onWideAngleChange: (v: boolean) => void;
  disabled?: boolean;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  icon: Icon,
  onChange,
  disabled,
  unit = "",
  showZero = true,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  icon: React.ComponentType<{ className?: string }>;
  onChange: (v: number) => void;
  disabled?: boolean;
  unit?: string;
  showZero?: boolean;
}) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span className="text-xs font-mono text-muted tabular-nums">
          {value > 0 && showZero ? "+" : ""}
          {value}
          {unit}
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          disabled={disabled}
          className="w-full disabled:opacity-40"
        />
        {/* Track fill */}
        <div
          className="absolute top-0 left-0 h-[6px] rounded-full bg-primary/30 pointer-events-none"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted/60">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}

export default function CameraControls({
  rotateRightLeft,
  moveForward,
  verticalAngle,
  wideAngle,
  onRotateChange,
  onMoveForwardChange,
  onVerticalAngleChange,
  onWideAngleChange,
  disabled,
}: CameraControlsProps) {
  const { t } = useI18n();

  const presets = [
    { name: t("preset.front"), rotate: 0, forward: 0, vertical: 0, wide: false },
    { name: t("preset.left45"), rotate: -45, forward: 0, vertical: 0, wide: false },
    { name: t("preset.right45"), rotate: 45, forward: 0, vertical: 0, wide: false },
    { name: t("preset.topDown"), rotate: 0, forward: 0, vertical: -1, wide: false },
    { name: t("preset.closeUp"), rotate: 0, forward: 7, vertical: 0, wide: false },
    { name: t("preset.wideShot"), rotate: 0, forward: 0, vertical: 0, wide: true },
    { name: t("preset.heroShot"), rotate: 30, forward: 3, vertical: -0.3, wide: false },
    { name: t("preset.lowAngle"), rotate: 0, forward: 2, vertical: 0.5, wide: false },
  ];

  const applyPreset = (preset: (typeof presets)[number]) => {
    onRotateChange(preset.rotate);
    onMoveForwardChange(preset.forward);
    onVerticalAngleChange(preset.vertical);
    onWideAngleChange(preset.wide);
  };

  const resetAll = () => {
    onRotateChange(0);
    onMoveForwardChange(0);
    onVerticalAngleChange(0);
    onWideAngleChange(false);
  };

  return (
    <div className="space-y-6">
      {/* Presets */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t("controls.quickPresets")}
          </h3>
          <button
            onClick={resetAll}
            disabled={disabled}
            className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors disabled:opacity-40"
          >
            <RotateCcwSquare className="w-3 h-3" />
            {t("preset.reset")}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset)}
              disabled={disabled}
              className="px-2 py-2 rounded-full bg-card border border-border text-xs font-medium hover:bg-card-hover hover:border-border-hover transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {t("controls.fineTune")}
        </h3>

        <Slider
          label={t("controls.rotation")}
          value={rotateRightLeft}
          min={-90}
          max={90}
          step={5}
          icon={MoveHorizontal}
          onChange={onRotateChange}
          disabled={disabled}
          unit="°"
        />

        <Slider
          label={t("controls.moveForward")}
          value={moveForward}
          min={0}
          max={10}
          step={0.5}
          icon={ZoomIn}
          onChange={onMoveForwardChange}
          disabled={disabled}
        />

        <Slider
          label={t("controls.verticalAngle")}
          value={verticalAngle}
          min={-1}
          max={1}
          step={0.1}
          icon={MoveVertical}
          onChange={onVerticalAngleChange}
          disabled={disabled}
        />

        {/* Wide Angle Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanEye className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">{t("controls.wideAngle")}</span>
          </div>
          <button
            onClick={() => onWideAngleChange(!wideAngle)}
            disabled={disabled}
            className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-40 ${
              wideAngle ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-foreground transition-transform ${
                wideAngle ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

    </div>
  );
}
