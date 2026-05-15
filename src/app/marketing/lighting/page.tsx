"use client";

import { useState, useCallback } from "react";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import ImageUploader from "@/components/ImageUploader";
import ResultPanel from "@/components/ResultPanel";
import LightingPanel, { LightingStyle } from "@/components/LightingPanel";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/useAuth";
import { useUsageTracking } from "@/lib/usage";
import { appendHistory, useHistorySelection } from "@/lib/marketing-history";

export default function MarketingLightingPage() {
  const { t } = useI18n();
  const { user, openLogin, refresh: refreshAuth } = useAuth();
  const { logUsage } = useUsageTracking(user?.email);

  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [lightingStyle, setLightingStyle] = useState<LightingStyle>("natural");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useHistorySelection((url) => {
    setSourceUrl(url);
    setSourceFile(null);
    setUploadedUrl(url);
    setResultUrl(null);
    setError(null);
  });

  const handleImageUpload = useCallback((url: string, file: File) => {
    setSourceUrl(url);
    setSourceFile(file);
    const isRemoteUrl = url.startsWith("http://") || url.startsWith("https://");
    setUploadedUrl(isRemoteUrl ? url : null);
    setResultUrl(null);
    setError(null);
  }, []);

  const handleClearImage = useCallback(() => {
    setSourceUrl(null);
    setSourceFile(null);
    setUploadedUrl(null);
    setResultUrl(null);
    setError(null);
  }, []);

  async function ensureUploaded(): Promise<string> {
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
  }

  async function handleGenerate() {
    if (!user) { openLogin(); return; }
    if (!sourceUrl) return;
    setLoading(true);
    setError(null);
    setResultUrl(null);
    try {
      const imageUrl = await ensureUploaded();
      const res = await fetch("/api/relight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          lighting_style: lightingStyle,
        }),
      });
      const data = await res.json();
      if (data.error) {
        logUsage("relight", { status: "error", detail: data.error });
        throw new Error(data.error);
      }
      logUsage("relight", { status: "success", detail: `style=${lightingStyle}` });
      const url = data.images?.[0]?.url || data.image?.url;
      if (!url) throw new Error("No image in response");
      setResultUrl(url);
      appendHistory({
        id: crypto.randomUUID(),
        sourceUrl: sourceUrl ?? "",
        resultUrl: url,
        mode: "lighting",
        settings: { rotate: 0, forward: 0, vertical: 0, wide: false, prompt: `lighting:${lightingStyle}` },
        timestamp: Date.now(),
      });
      refreshAuth();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      if (msg.includes("Authentication") || msg.includes("sign in")) {
        openLogin();
        refreshAuth();
      }
      if (msg.includes("Insufficient credits")) refreshAuth();
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {t("heading.sourceImage")}
        </h2>
        <ImageUploader
          imageUrl={sourceUrl}
          onImageUpload={handleImageUpload}
          onClear={handleClearImage}
          disabled={loading}
        />

        {sourceUrl && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <LightingPanel
              lightingStyle={lightingStyle}
              onStyleChange={setLightingStyle}
              disabled={loading}
            />

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? t("generate.relighting") : t("generate.lighting")}
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

      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {t("heading.result")}
        </h2>
        <ResultPanel
          resultUrl={resultUrl}
          loading={loading}
          error={null}
          emptyHint={t("result.emptyLightingHint")}
        />
      </div>
    </div>
  );
}
