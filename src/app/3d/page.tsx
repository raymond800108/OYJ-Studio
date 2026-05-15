"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Loader2, Sparkles, AlertCircle, Box } from "lucide-react";
import ImageUploader from "@/components/ImageUploader";
import PriceEstimate from "@/components/PriceEstimate";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/useAuth";
import { useUsageTracking } from "@/lib/usage";

const ModelViewer = dynamic(() => import("@/components/ModelViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[400px] rounded-2xl bg-card border border-border">
      <Loader2 className="w-5 h-5 animate-spin text-muted" />
    </div>
  ),
});

interface Estimation {
  product_name: string;
  materials: string[];
  material_analysis: string;
  unit_cost_twd: { low: number; high: number };
  unit_cost_usd: { low: number; high: number };
  batch_note: string;
  confidence: "low" | "medium" | "high";
}

export default function ThreeDPage() {
  const { t } = useI18n();
  const { user, openLogin, refresh: refreshAuth } = useAuth();
  const { logUsage } = useUsageTracking(user?.email);

  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const [meshyTaskId, setMeshyTaskId] = useState<string | null>(null);
  const [meshyProgress, setMeshyProgress] = useState(0);
  const [meshyStatus, setMeshyStatus] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);

  const [estimation, setEstimation] = useState<Estimation | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageUpload = useCallback((url: string, file: File) => {
    setSourceUrl(url);
    setSourceFile(file);
    const isRemoteUrl = url.startsWith("http://") || url.startsWith("https://");
    setUploadedUrl(isRemoteUrl ? url : null);
    setModelUrl(null);
    setMeshyTaskId(null);
    setMeshyStatus(null);
    setMeshyProgress(0);
    setEstimation(null);
    setEstimateError(null);
    setError(null);
    setLoading(false);
  }, []);

  const handleClearImage = useCallback(() => {
    setSourceUrl(null);
    setSourceFile(null);
    setUploadedUrl(null);
    setModelUrl(null);
    setMeshyTaskId(null);
    setMeshyStatus(null);
    setMeshyProgress(0);
    setEstimation(null);
    setEstimateError(null);
    setError(null);
    setLoading(false);
  }, []);

  async function ensureUploaded(): Promise<string> {
    if (uploadedUrl) return uploadedUrl;
    if (!sourceFile) throw new Error("No image selected");
    const fd = new FormData();
    fd.append("file", sourceFile);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setUploadedUrl(data.url);
    return data.url;
  }

  async function handleGenerate() {
    if (!user) { openLogin(); return; }
    if (!sourceUrl) return;
    setLoading(true);
    setError(null);
    setModelUrl(null);
    setMeshyTaskId(null);
    setMeshyStatus(null);
    setMeshyProgress(0);
    setEstimation(null);
    setEstimateError(null);
    try {
      const imageUrl = await ensureUploaded();
      const res = await fetch("/api/meshy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      const data = await res.json();
      if (data.error) {
        logUsage("3d-generate", { status: "error", detail: data.error });
        if (data.error.includes("Authentication") || data.error.includes("sign in")) {
          openLogin(); refreshAuth();
        }
        if (data.error.includes("Insufficient credits")) refreshAuth();
        throw new Error(data.error);
      }
      logUsage("3d-generate", { status: "success", detail: `Task ${data.taskId}` });
      setMeshyTaskId(data.taskId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setLoading(false);
    }
  }

  // Poll Meshy task. Aborts cleanly on unmount / taskId change.
  useEffect(() => {
    if (!meshyTaskId || modelUrl) return;
    let aborted = false;
    const poll = async () => {
      if (aborted) return;
      try {
        const res = await fetch(`/api/meshy?taskId=${meshyTaskId}`);
        const data = await res.json();
        if (aborted) return;
        if (data.error) {
          const msg = String(data.error);
          if (msg.includes("Authentication") || msg.includes("sign in")) {
            openLogin();
            refreshAuth();
          }
          if (msg.includes("Insufficient credits")) refreshAuth();
          setError(msg);
          setLoading(false);
          return;
        }
        setMeshyProgress(data.progress ?? 0);
        setMeshyStatus(data.status);
        if (data.status === "SUCCEEDED" && data.model_urls?.glb) {
          const glbUrl = `/api/proxy-model?url=${encodeURIComponent(data.model_urls.glb)}`;
          setModelUrl(glbUrl);
          setLoading(false);
        } else if (data.status === "FAILED") {
          setError(t("3d.modelFailed"));
          setLoading(false);
        }
      } catch {
        // continue polling on network errors
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      aborted = true;
      clearInterval(id);
    };
  }, [meshyTaskId, modelUrl, t, openLogin, refreshAuth]);

  // Fetch price estimate when model completes. Abort prevents stale uploadedUrl
  // from clobbering a fresh estimate if the user uploads a new image mid-fetch.
  useEffect(() => {
    if (!modelUrl || estimation || estimateLoading || !uploadedUrl) return;
    let aborted = false;
    const url = uploadedUrl;
    (async () => {
      setEstimateLoading(true);
      setEstimateError(null);
      try {
        const res = await fetch("/api/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: url }),
        });
        const data = await res.json();
        if (aborted) return;
        if (data.error) {
          logUsage("estimate", { status: "error", detail: data.error });
          throw new Error(data.error);
        }
        logUsage("estimate", { status: "success", detail: data.product_name });
        setEstimation(data);
      } catch (e) {
        if (!aborted) setEstimateError(e instanceof Error ? e.message : "Estimation failed");
      } finally {
        if (!aborted) setEstimateLoading(false);
      }
    })();
    return () => { aborted = true; };
  }, [modelUrl, estimation, estimateLoading, uploadedUrl, logUsage]);

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
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Box className="w-4 h-4" />}
              {loading
                ? `${t("generate.generating3d")} ${meshyProgress}%`
                : t("generate.generate3d")}
            </button>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {(estimation || estimateLoading || estimateError) && (
              <PriceEstimate estimation={estimation} loading={estimateLoading} error={estimateError} />
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {t("heading.3dPreview")}
        </h2>
        {modelUrl ? (
          <ModelViewer modelUrl={modelUrl} />
        ) : loading ? (
          <div className="rounded-2xl border border-border bg-card flex flex-col items-center justify-center min-h-[400px] gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-muted" />
            <p className="text-xs text-muted">
              {meshyStatus === "PENDING" ? t("3d.queued") : t("3d.processing")} · {meshyProgress}%
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card flex flex-col items-center justify-center min-h-[400px] gap-2 text-center px-6">
            <Sparkles className="w-5 h-5 text-muted" />
            <p className="text-xs text-muted font-medium">{t("3d.willAppear")}</p>
            <p className="text-[11px] text-muted">{t("3d.uploadToGenerate")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
