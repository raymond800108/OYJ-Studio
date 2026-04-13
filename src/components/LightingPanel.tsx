"use client";

import { useState, useCallback } from "react";
import {
  Sun,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Loader2,
  Download,
  SunDim,
} from "lucide-react";
import type { ApiAction } from "@/lib/usage";

// ── Types ────────────────────────────────────────────────────────────────
type LightDirection = "None" | "Left" | "Right" | "Top" | "Bottom";

interface LightingPanelProps {
  sourceUrl: string | null;
  /** Returns a hosted (non-blob) URL for the source image */
  ensureUploaded: () => Promise<string>;
  disabled?: boolean;
  /** Lift loading/result/error state to the parent so ResultPanel shows them */
  onLoadingChange?: (loading: boolean) => void;
  onResultChange?: (url: string | null) => void;
  onErrorChange?: (error: string | null) => void;
  logUsage?: (
    action: ApiAction,
    opts?: {
      status?: "success" | "error";
      tokensIn?: number;
      tokensOut?: number;
      costOverride?: number;
      detail?: string;
    }
  ) => void;
}

// ── Presets ───────────────────────────────────────────────────────────────
const DIRECTION_PRESETS: {
  key: LightDirection;
  label: string;
  labelZh: string;
  icon: typeof Sun;
}[] = [
  { key: "None", label: "Auto", labelZh: "自動", icon: SunDim },
  { key: "Left", label: "Left", labelZh: "左方", icon: ArrowLeft },
  { key: "Right", label: "Right", labelZh: "右方", icon: ArrowRight },
  { key: "Top", label: "Top", labelZh: "上方", icon: ArrowUp },
  { key: "Bottom", label: "Bottom", labelZh: "下方", icon: ArrowDown },
];

const SCENE_PRESETS = [
  { label: "Golden Hour", labelZh: "黃金時刻", prompt: "warm golden hour sunlight from the side, soft amber glow, long gentle shadows, professional product photography" },
  { label: "Studio Soft", labelZh: "柔和棚燈", prompt: "professional studio soft diffused lighting, clean white studio, even illumination, luxury product photography" },
  { label: "Dramatic Side", labelZh: "戲劇側光", prompt: "dramatic single directional side light, strong contrast, deep shadows, moody luxury product photography" },
  { label: "Window Light", labelZh: "窗光", prompt: "soft natural window light, gentle directional illumination, warm ambient fill, editorial product photography" },
  { label: "Neon Accent", labelZh: "霓虹強調", prompt: "subtle neon accent lighting, cool blue and warm pink rim lights, contemporary fashion product photography" },
  { label: "Overhead", labelZh: "頂光", prompt: "overhead top-down lighting, defined shadows below, clean bright illumination, catalog product photography" },
];

// ── Component ────────────────────────────────────────────────────────────
export default function LightingPanel({
  sourceUrl,
  ensureUploaded,
  disabled = false,
  onLoadingChange,
  onResultChange,
  onErrorChange,
  logUsage,
}: LightingPanelProps) {
  // Controls
  const [direction, setDirection] = useState<LightDirection>("None");
  const [guidanceScale, setGuidanceScale] = useState(5);
  const [prompt, setPrompt] = useState("");
  const [enableHrFix, setEnableHrFix] = useState(true);

  // Generation state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!sourceUrl) return;

    const lightPrompt =
      prompt.trim() ||
      "professional studio lighting, luxury product photography, clean and refined illumination";

    setLoading(true);
    onLoadingChange?.(true);
    setError(null);
    onErrorChange?.(null);

    try {
      // Get hosted URL (handles blob: → fal storage upload)
      const hostedUrl = await ensureUploaded();

      const res = await fetch("/api/relight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: hostedUrl,
          prompt: lightPrompt,
          initial_latent: direction,
          guidance_scale: guidanceScale,
          enable_hr_fix: enableHrFix,
          output_format: "png",
        }),
      });

      const data = await res.json();

      if (data.error) {
        logUsage?.("relight", { status: "error", detail: data.error });
        setError(data.error);
        onErrorChange?.(data.error);
        return;
      }

      const imageUrl = data.images?.[0]?.url;
      if (imageUrl) {
        setResultUrl(imageUrl);
        onResultChange?.(imageUrl);
        logUsage?.("relight", { status: "success", detail: `direction=${direction}` });
      } else {
        const errMsg = "No image returned from the API";
        setError(errMsg);
        onErrorChange?.(errMsg);
        logUsage?.("relight", { status: "error", detail: "No image in response" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      onErrorChange?.(msg);
      logUsage?.("relight", { status: "error", detail: msg });
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }, [sourceUrl, prompt, direction, guidanceScale, enableHrFix, logUsage, onLoadingChange, onResultChange, onErrorChange]);

  const handleDownload = useCallback(async () => {
    if (!resultUrl) return;
    try {
      const res = await fetch(resultUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relight-${direction.toLowerCase()}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore download errors */
    }
  }, [resultUrl, direction]);

  if (!sourceUrl) return null;

  return (
    <div className="space-y-4">
      {/* Light Direction Presets */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
          Light Direction
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          {DIRECTION_PRESETS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setDirection(key)}
              disabled={disabled || loading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                direction === key
                  ? "bg-foreground text-background border-foreground shadow-sm"
                  : "bg-card text-muted border-border hover:border-foreground/20 hover:text-foreground"
              } disabled:opacity-40`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
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
          <span className="absolute top-1 left-1/2 -ml-4 text-[9px] text-muted">Top</span>
          <span className="absolute bottom-1 left-1/2 -ml-6 text-[9px] text-muted">Bottom</span>
          <span className="absolute left-1.5 top-1/2 -mt-1.5 text-[9px] text-muted">Left</span>
          <span className="absolute right-1 top-1/2 -mt-1.5 text-[9px] text-muted">Right</span>
        </div>
      </div>

      {/* Scene Presets */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
          Scene Presets
        </h3>
        <div className="flex items-center gap-1.5 flex-wrap">
          {SCENE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => setPrompt(preset.prompt)}
              disabled={disabled || loading}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all border ${
                prompt === preset.prompt
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-muted border-border hover:border-foreground/20 hover:text-foreground"
              } disabled:opacity-40`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt */}
      <div>
        <label className="text-xs font-medium text-foreground/80 mb-1.5 block">
          Lighting Description
        </label>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., warm golden hour sunlight from the left side..."
          disabled={disabled || loading}
          className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-40"
        />
      </div>

      {/* Guidance Scale Slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-foreground/80">
            Prompt Strength
          </label>
          <span className="text-xs text-muted tabular-nums">{guidanceScale.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min={1}
          max={15}
          step={0.5}
          value={guidanceScale}
          onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
          disabled={disabled || loading}
          className="w-full accent-foreground disabled:opacity-40"
        />
        <div className="flex justify-between text-[9px] text-muted/50 mt-0.5">
          <span>Subtle</span>
          <span>Strong</span>
        </div>
      </div>

      {/* HR Fix Toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enableHrFix}
          onChange={(e) => setEnableHrFix(e.target.checked)}
          disabled={disabled || loading}
          className="accent-foreground w-3.5 h-3.5"
        />
        <span className="text-xs text-foreground/80">High-resolution fix</span>
      </label>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={disabled || loading || !sourceUrl}
        className="w-full py-3 rounded-xl text-sm font-semibold bg-foreground text-background hover:bg-primary-hover transition-all disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sun className="w-4 h-4" />
            Generate Relighting
          </>
        )}
      </button>

      {/* Reset */}
      <button
        onClick={() => {
          setDirection("None");
          setGuidanceScale(5);
          setPrompt("");
          setEnableHrFix(true);
        }}
        disabled={disabled || loading}
        className="px-2 py-1 rounded-md text-[11px] text-muted hover:text-foreground disabled:opacity-40"
      >
        <RotateCcw className="w-3 h-3 inline mr-0.5" />
        Reset
      </button>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
