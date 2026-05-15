"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import ImageUploader from "@/components/ImageUploader";
import ResultPanel from "@/components/ResultPanel";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/useAuth";
import { useUsageTracking } from "@/lib/usage";

const MaskPainter = dynamic(() => import("@/components/MaskPainter"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[300px] rounded-xl bg-card border border-border">
      <p className="text-sm text-muted">Loading editor…</p>
    </div>
  ),
});

export default function MarketingEditPage() {
  const { t } = useI18n();
  const { user, openLogin, refresh: refreshAuth } = useAuth();
  const { logUsage } = useUsageTracking(user?.email);

  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inpaintStrength, setInpaintStrength] = useState(0.85);
  const [steps, setSteps] = useState(8);

  const handleImageUpload = useCallback((url: string, file: File) => {
    setSourceUrl(url);
    setSourceFile(file);
    const isRemoteUrl = url.startsWith("http://") || url.startsWith("https://");
    setUploadedUrl(isRemoteUrl ? url : null);
    setMaskDataUrl(null);
    setResultUrl(null);
    setError(null);
  }, []);

  const handleClearImage = useCallback(() => {
    setSourceUrl(null);
    setSourceFile(null);
    setUploadedUrl(null);
    setMaskDataUrl(null);
    setResultUrl(null);
    setError(null);
  }, []);

  const ensureUploaded = async (): Promise<string> => {
    if (uploadedUrl) return uploadedUrl;
    if (!sourceFile) throw new Error("No image selected");
    const fd = new FormData();
    fd.append("file", sourceFile);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (data.error) {
      logUsage("upload", { status: "error", detail: data.error });
      throw new Error(data.error);
    }
    logUsage("upload", { status: "success" });
    setUploadedUrl(data.url);
    return data.url;
  };

  const uploadMask = async (dataUrl: string): Promise<string> => {
    const blob = await fetch(dataUrl).then((r) => r.blob());
    const file = new File([blob], "mask.png", { type: "image/png" });
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.url;
  };

  async function handleGenerate() {
    if (!user) { openLogin(); return; }
    if (!sourceUrl) return;
    if (!maskDataUrl) { setError(t("mask.paintFirst")); return; }
    if (!prompt) { setError(t("mask.enterPrompt")); return; }

    setLoading(true);
    setError(null);
    setResultUrl(null);

    try {
      const imageUrl = await ensureUploaded();
      const maskUrl = await uploadMask(maskDataUrl);

      const res = await fetch("/api/inpaint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          mask_url: maskUrl,
          prompt,
          strength: inpaintStrength,
          num_inference_steps: steps,
        }),
      });
      const data = await res.json();
      if (data.error) {
        logUsage("inpaint", { status: "error", detail: data.error });
        if (data.error.includes("Authentication") || data.error.includes("sign in")) {
          openLogin();
          refreshAuth();
        }
        if (data.error.includes("Insufficient credits")) refreshAuth();
        throw new Error(data.error);
      }
      logUsage("inpaint", { status: "success", detail: prompt });
      const url = data.images?.[0]?.url || data.image?.url || data.output?.url;
      if (!url) throw new Error("No image in response");
      setResultUrl(url);
      refreshAuth();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      if (msg.includes("Authentication required") || msg.includes("sign in")) {
        openLogin();
        refreshAuth();
      }
      if (msg.includes("Insufficient credits")) refreshAuth();
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const canGenerate = !!sourceUrl && !loading && !!maskDataUrl && !!prompt;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Left: Source / Mask Painter */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {sourceUrl ? t("heading.paintArea") : t("heading.sourceImage")}
        </h2>

        {sourceUrl ? (
          <MaskPainter
            imageUrl={sourceUrl}
            onMaskReady={setMaskDataUrl}
            disabled={loading}
          />
        ) : (
          <ImageUploader
            imageUrl={sourceUrl}
            onImageUpload={handleImageUpload}
            onClear={handleClearImage}
            disabled={loading}
          />
        )}

        {sourceUrl && (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted block">
              {t("prompt.inpaint")}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder={t("prompt.inpaintPlaceholder")}
              disabled={loading}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-accent/30 resize-none disabled:opacity-50"
            />

            <details className="text-xs">
              <summary className="cursor-pointer text-muted">{t("advanced.title")}</summary>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="flex items-center justify-between mb-1">
                    <span className="text-xs">{t("advanced.editStrength")}</span>
                    <span className="text-[10px] text-muted">{inpaintStrength.toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min={0.3}
                    max={1}
                    step={0.05}
                    value={inpaintStrength}
                    onChange={(e) => setInpaintStrength(parseFloat(e.target.value))}
                    disabled={loading}
                    className="w-full"
                  />
                  <p className="text-[10px] text-muted">{t("advanced.editStrengthNote")}</p>
                </div>
                <div>
                  <label className="flex items-center justify-between mb-1">
                    <span className="text-xs">{t("advanced.quality")}</span>
                    <span className="text-[10px] text-muted">{steps} {t("advanced.steps")}</span>
                  </label>
                  <input
                    type="range"
                    min={4}
                    max={20}
                    step={1}
                    value={steps}
                    onChange={(e) => setSteps(parseInt(e.target.value, 10))}
                    disabled={loading}
                    className="w-full"
                  />
                  <p className="text-[10px] text-muted">{t("advanced.qualityNote")}</p>
                </div>
              </div>
            </details>

            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? t("generate.editingRegion") : t("generate.editRegion")}
            </button>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Result */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {t("heading.result")}
        </h2>
        <ResultPanel
          resultUrl={resultUrl}
          loading={loading}
          error={null}
          emptyHint={t("result.emptyEditHint")}
        />
      </div>
    </div>
  );
}
