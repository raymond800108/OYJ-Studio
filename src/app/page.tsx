"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Camera,
  Sparkles,
  Wand2,
  Paintbrush,
  Box,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Info,
  Loader2,
  Megaphone,
  Globe,
  BarChart3,
} from "lucide-react";
import ImageUploader from "@/components/ImageUploader";
import CameraOrbit from "@/components/CameraOrbit";
import CameraControls from "@/components/CameraControls";
import ResultPanel from "@/components/ResultPanel";
import PriceEstimate from "@/components/PriceEstimate";
import HistoryPanel, { HistoryItem } from "@/components/HistoryPanel";
import { useI18n } from "@/lib/i18n";
import { useUsageTracking } from "@/lib/usage";
import { useAuth } from "@/lib/useAuth";
import UserMenu from "@/components/UserMenu";
import dynamic from "next/dynamic";

// Lazy-load heavy components (not SSR-friendly)
const MaskPainter = dynamic(() => import("@/components/MaskPainter"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[300px] rounded-xl bg-card border border-border">
      <p className="text-sm text-muted">Loading editor...</p>
    </div>
  ),
});

const ModelViewer = dynamic(() => import("@/components/ModelViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[400px] rounded-2xl bg-card border border-border">
      <Loader2 className="w-5 h-5 animate-spin text-muted" />
    </div>
  ),
});

const MarketingPanel = dynamic(
  () => import("@/components/MarketingPanel"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[400px] rounded-2xl bg-card border border-border">
        <Loader2 className="w-5 h-5 animate-spin text-muted" />
      </div>
    ),
  }
);

const UsagePanel = dynamic(
  () => import("@/components/UsagePanel"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[400px] rounded-2xl bg-card border border-border">
        <Loader2 className="w-5 h-5 animate-spin text-muted" />
      </div>
    ),
  }
);

type Mode = "camera" | "inpaint" | "3d" | "marketing" | "usage";

interface Estimation {
  product_name: string;
  materials: string[];
  material_analysis: string;
  unit_cost_twd: { low: number; high: number };
  unit_cost_usd: { low: number; high: number };
  batch_note: string;
  confidence: "low" | "medium" | "high";
}

export default function Home() {
  const { lang, setLang, t } = useI18n();
  const { entries: usageEntries, logUsage, clearUsage, summary: usageSummary, kvAvailable, refreshFromServer } = useUsageTracking();
  const { user, openLogin, refresh: refreshAuth, ready, loading: authLoading } = useAuth();

  // Detect auth_error=not_allowed from OAuth redirect
  const [authError, setAuthError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("auth_error");
    if (err) {
      setAuthError(err);
      // Clean URL without reloading
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // Auth-required check — opens login if not signed in
  const requireSignIn = useCallback(() => {
    if (!user) {
      openLogin();
      return true; // blocked
    }
    return false; // ok
  }, [user, openLogin]);

  // Mode
  const [mode, setMode] = useState<Mode>("camera");

  // Image state
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  // Camera controls
  const [rotateRightLeft, setRotateRightLeft] = useState(0);
  const [moveForward, setMoveForward] = useState(0);
  const [verticalAngle, setVerticalAngle] = useState(0);
  const [wideAngle, setWideAngle] = useState(false);

  // Inpaint state
  const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);

  // 3D state
  const [meshyTaskId, setMeshyTaskId] = useState<string | null>(null);
  const [meshyProgress, setMeshyProgress] = useState(0);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [meshyStatus, setMeshyStatus] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Price estimation
  const [estimation, setEstimation] = useState<Estimation | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  // Prompt
  const [prompt, setPrompt] = useState("");

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loraScale, setLoraScale] = useState(1.5);
  const [steps, setSteps] = useState(8);
  const [inpaintStrength, setInpaintStrength] = useState(0.85);

  // Status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // History
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Shared latest generated results — visible across all pages
  const [sharedResults, setSharedResults] = useState<string[]>([]);

  // Marketing generation state — shared so other pages can show indicator
  const [marketingLoading, setMarketingLoading] = useState(false);
  const [marketingProgress, setMarketingProgress] = useState<string>("");

  // Sync resultUrl when sharedResults changes (e.g. from marketing generation)
  useEffect(() => {
    if (sharedResults.length > 0 && mode !== "marketing") {
      setResultUrl(sharedResults[0]);
    }
  }, [sharedResults]);

  const handleImageUpload = useCallback((url: string, file: File) => {
    setSourceUrl(url);
    setSourceFile(file);
    // If the URL is already a remote hosted URL (e.g. from history drop), use it directly
    const isRemoteUrl = url.startsWith("http://") || url.startsWith("https://");
    setUploadedUrl(isRemoteUrl ? url : null);
    setResultUrl(null);
    setError(null);
    setMaskDataUrl(null);
    setModelUrl(null);
    setMeshyTaskId(null);
    setMeshyStatus(null);
    setEstimation(null);
    setEstimateError(null);
  }, []);

  const handleClearImage = useCallback(() => {
    setSourceUrl(null);
    setSourceFile(null);
    setUploadedUrl(null);
    setResultUrl(null);
    setError(null);
    setMaskDataUrl(null);
    setModelUrl(null);
    setMeshyTaskId(null);
    setMeshyStatus(null);
    setEstimation(null);
    setEstimateError(null);
  }, []);

  // Upload file to fal storage (cached)
  const ensureUploaded = async (): Promise<string> => {
    if (uploadedUrl) return uploadedUrl;
    if (!sourceFile) throw new Error("No image selected");

    const formData = new FormData();
    formData.append("file", sourceFile);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (data.error) {
      logUsage("upload", { status: "error", detail: data.error });
      throw new Error(data.error);
    }
    logUsage("upload", { status: "success" });
    setUploadedUrl(data.url);
    return data.url;
  };

  // Upload mask data URL as a file
  const uploadMask = async (dataUrl: string): Promise<string> => {
    const blob = await fetch(dataUrl).then((r) => r.blob());
    const file = new File([blob], "mask.png", { type: "image/png" });
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.url;
  };

  // Poll Meshy task status
  useEffect(() => {
    if (!meshyTaskId || modelUrl) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/meshy?taskId=${meshyTaskId}`);
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          setLoading(false);
          if (pollingRef.current) clearInterval(pollingRef.current);
          return;
        }

        setMeshyProgress(data.progress ?? 0);
        setMeshyStatus(data.status);

        if (data.status === "SUCCEEDED" && data.model_urls?.glb) {
          // Proxy through our API to avoid CORS
          const glbUrl = `/api/proxy-model?url=${encodeURIComponent(data.model_urls.glb)}`;
          setModelUrl(glbUrl);
          setLoading(false);
          // Share source image as the result thumbnail for 3D
          if (sourceUrl) setSharedResults([sourceUrl]);
          if (pollingRef.current) clearInterval(pollingRef.current);

          // Add 3D result to history — use source image as thumbnail
          setHistory((prev) => [
            {
              id: crypto.randomUUID(),
              sourceUrl: uploadedUrl || sourceUrl || "",
              resultUrl: sourceUrl || "", // use source image as thumbnail for 3D
              mode: "3d" as const,
              settings: {
                rotate: rotateRightLeft,
                forward: moveForward,
                vertical: verticalAngle,
                wide: wideAngle,
                prompt: prompt || "3D Model",
              },
              timestamp: Date.now(),
            },
            ...prev.slice(0, 11),
          ]);
        } else if (data.status === "FAILED") {
          setError(t("3d.modelFailed"));
          setLoading(false);
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch {
        // Continue polling on network errors
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [meshyTaskId, modelUrl]);

  // Fetch price estimation when model completes
  const fetchEstimate = async () => {
    if (!uploadedUrl) return;
    setEstimateLoading(true);
    setEstimateError(null);
    try {
      const imageUrl = uploadedUrl;
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      const data = await res.json();
      if (data.error) {
        logUsage("estimate", { status: "error", detail: data.error });
        throw new Error(data.error);
      }
      logUsage("estimate", { status: "success", detail: data.product_name });
      setEstimation(data);
    } catch (err) {
      setEstimateError(
        err instanceof Error ? err.message : "Estimation failed"
      );
    } finally {
      setEstimateLoading(false);
    }
  };

  // Auto-fetch estimate when 3D model is ready
  useEffect(() => {
    if (modelUrl && !estimation && !estimateLoading) {
      fetchEstimate();
    }
  }, [modelUrl]);

  const handleGenerate = async () => {
    if (!sourceFile && !sourceUrl) return;
    if (requireSignIn()) return;

    setLoading(true);
    setError(null);
    setResultUrl(null);
    setModelUrl(null);
    setMeshyTaskId(null);
    setMeshyStatus(null);
    setEstimation(null);
    setEstimateError(null);

    try {
      const imageUrl = await ensureUploaded();

      if (mode === "3d") {
        // 3D model generation flow
        const res = await fetch("/api/meshy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: imageUrl }),
        });
        const data = await res.json();
        if (data.error) {
          logUsage("3d-generate", { status: "error", detail: data.error });
          throw new Error(data.error);
        }
        logUsage("3d-generate", { status: "success", detail: `Task ${data.taskId}` });
        setMeshyTaskId(data.taskId);
        // Loading continues — polling effect will handle completion
        return;
      }

      let generatedUrl = "";

      if (mode === "inpaint") {
        if (!maskDataUrl) throw new Error(t("mask.paintFirst"));
        if (!prompt)
          throw new Error(t("mask.enterPrompt"));

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
          throw new Error(data.error);
        }
        logUsage("inpaint", { status: "success", detail: prompt });

        generatedUrl =
          data.images?.[0]?.url || data.image?.url || data.output?.url;
        if (!generatedUrl) throw new Error("No image in response");
        setResultUrl(generatedUrl);
        setSharedResults([generatedUrl]);
      } else {
        // Camera angle flow
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: imageUrl,
            rotate_right_left: rotateRightLeft,
            move_forward: moveForward,
            vertical_angle: verticalAngle,
            wide_angle_lens: wideAngle,
            prompt: prompt || undefined,
            lora_scale: loraScale,
            num_inference_steps: steps,
          }),
        });
        const data = await res.json();
        if (data.error) {
          logUsage("camera-generate", { status: "error", detail: data.error });
          throw new Error(data.error);
        }
        logUsage("camera-generate", { status: "success", detail: `rot=${rotateRightLeft} fwd=${moveForward} vert=${verticalAngle}` });

        generatedUrl =
          data.images?.[0]?.url || data.image?.url || data.output?.url;
        if (!generatedUrl) throw new Error("No image in response");
        setResultUrl(generatedUrl);
        setSharedResults([generatedUrl]);
      }

      // Refresh auth to update credits display
      refreshAuth();

      // Add to history
      setHistory((prev) => [
        {
          id: crypto.randomUUID(),
          sourceUrl: sourceUrl!,
          resultUrl: generatedUrl,
          mode: mode === "inpaint" ? "inpaint" as const : "camera" as const,
          settings: {
            rotate: rotateRightLeft,
            forward: moveForward,
            vertical: verticalAngle,
            wide: wideAngle,
            prompt,
          },
          timestamp: Date.now(),
        },
        ...prev.slice(0, 11),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      // If auth error, open login modal
      if (msg.includes("Authentication required") || msg.includes("sign in")) {
        openLogin();
        refreshAuth();
      }
      // If credits error, refresh auth to update credits display
      if (msg.includes("Insufficient credits")) {
        refreshAuth();
      }
      setError(msg);
      setLoading(false);
    } finally {
      if (mode !== "3d") setLoading(false);
    }
  };

  const handleHistorySelect = (item: HistoryItem) => {
    setResultUrl(item.resultUrl);
    setRotateRightLeft(item.settings.rotate);
    setMoveForward(item.settings.forward);
    setVerticalAngle(item.settings.vertical);
    setWideAngle(item.settings.wide);
    setPrompt(item.settings.prompt);
  };

  const canGenerate =
    sourceUrl &&
    !loading &&
    (mode === "camera" ||
      mode === "3d" ||
      (mode === "inpaint" && maskDataUrl && prompt));

  const getButtonLabel = () => {
    if (loading) {
      if (mode === "3d") return `${t("generate.generating3d")} ${meshyProgress}%`;
      if (mode === "inpaint") return t("generate.editingRegion");
      return t("generate.generating");
    }
    if (mode === "3d") return t("generate.generate3d");
    if (mode === "inpaint") return t("generate.editRegion");
    return t("generate.generate");
  };

  /* ─── Landing page (not signed in) ─────────────────────────────── */
  if (!user && ready) {
    return (
      <div className="flex-1 flex flex-col min-h-screen bg-gradient-to-b from-background via-background to-card">
        {/* Minimal top bar */}
        <header className="px-6 py-5 flex items-center justify-between max-w-7xl w-full mx-auto relative z-10">
          <img
            src="/logo.svg"
            alt="Olivia Yao Jewellery"
            className="h-8"
            style={{ filter: "brightness(0)" }}
          />
          <div className="flex items-center gap-3">
            {/* Language Toggle */}
            <div className="flex items-center bg-card border border-border rounded-full p-0.5 gap-0.5">
              <button
                onClick={() => setLang("en")}
                className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  lang === "en"
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLang("zh")}
                className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  lang === "zh"
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                中
              </button>
            </div>
          </div>
        </header>

        {/* Hero */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 -mt-16">
          <div className="text-center max-w-2xl">
            <img
              src="/logo.svg"
              alt="Olivia Yao Jewellery"
              className="h-28 mx-auto mb-8"
              style={{ filter: "brightness(0)" }}
            />
            <p className="mt-4 text-lg text-muted max-w-md mx-auto leading-relaxed">
              {lang === "zh"
                ? "AI 驅動的產品攝影、3D 建模與行銷內容生成平台"
                : "AI-powered product photography, 3D modeling & marketing content platform"}
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap justify-center gap-2 mt-8">
              {[
                { icon: Camera, label: lang === "zh" ? "相機角度" : "Camera Angle" },
                { icon: Paintbrush, label: lang === "zh" ? "AI 編輯" : "AI Edit" },
                { icon: Box, label: lang === "zh" ? "3D 建模" : "3D Modeling" },
                { icon: Megaphone, label: lang === "zh" ? "行銷素材" : "Marketing" },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-card border border-border text-muted"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </span>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={openLogin}
              className="mt-10 inline-flex items-center gap-2 px-8 py-3 rounded-full text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-all shadow-lg"
            >
              <Sparkles className="w-4 h-4" />
              {lang === "zh" ? "登入開始使用" : "Sign in to get started"}
            </button>
            <p className="mt-3 text-xs text-muted">
              {lang === "zh" ? "免費註冊即享 15 點額度" : "Sign up free with 15 credits"}
            </p>
          </div>
        </main>

        {/* Footer */}
        <footer className="px-6 py-4 text-center text-[11px] text-muted/60">
          Olivia Yao Jewellery &copy; {new Date().getFullYear()}
        </footer>

        {/* Access Denied Modal */}
        {authError === "not_allowed" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setAuthError(null)}
            />
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8 text-center">
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {lang === "zh" ? "存取被拒絕" : "Access Denied"}
              </h2>
              <p className="mt-2 text-sm text-muted leading-relaxed">
                {lang === "zh"
                  ? "您的帳號尚未獲得授權使用此應用程式。如需存取權限，請聯繫管理員。"
                  : "Your account is not authorized to use this application. Please contact the administrator for access."}
              </p>
              <button
                onClick={() => setAuthError(null)}
                className="mt-6 px-6 py-2 rounded-full text-sm font-medium bg-foreground text-background hover:opacity-90 transition-all"
              >
                {lang === "zh" ? "了解" : "OK"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── Loading auth state ───────────────────────────────────────── */
  if (!ready || authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  /* ─── Main app (signed in) ─────────────────────────────────────── */
  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 bg-card">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.svg"
              alt="Olivia Yao Jewellery"
              className="h-10 text-foreground"
              style={{ filter: "brightness(0)" }}
            />
          </div>

          <div className="flex items-center gap-3">
            {/* Mode Switcher */}
            <div className="flex items-center bg-background border border-border rounded-full p-0.5 gap-0.5">
              {(
                [
                  { key: "camera", icon: Camera, labelKey: "mode.camera" as const },
                  { key: "inpaint", icon: Paintbrush, labelKey: "mode.edit" as const },
                  { key: "3d", icon: Box, labelKey: "mode.3d" as const },
                  { key: "marketing", icon: Megaphone, labelKey: "mode.marketing" as const },
                  { key: "usage", icon: BarChart3, labelKey: "mode.usage" as const },
                ] as const
              ).map(({ key, icon: Icon, labelKey }) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                    mode === key
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t(labelKey)}
                </button>
              ))}
            </div>

            {/* Language Toggle */}
            <div className="flex items-center bg-background border border-border rounded-full p-0.5 gap-0.5">
              <button
                onClick={() => setLang("en")}
                className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  lang === "en"
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLang("zh")}
                className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  lang === "zh"
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                中
              </button>
            </div>

            {/* User Menu */}
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-5">
        {mode === "usage" ? (
          <div className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t("usage.title" as import("@/lib/i18n").TKey)}
            </h2>
            <UsagePanel
              entries={usageEntries}
              summary={usageSummary}
              onClear={clearUsage}
              kvAvailable={kvAvailable}
              onRefresh={refreshFromServer}
            />
          </div>
        ) : mode === "marketing" ? (
          <MarketingPanel
            history={history}
            onAddHistory={(item) =>
              setHistory((prev) => [item, ...prev.slice(0, 11)])
            }
            sharedResults={sharedResults}
            onSharedResults={setSharedResults}
            onLoadingChange={setMarketingLoading}
            onProgressChange={setMarketingProgress}
            otherPageLoading={loading}
            otherPageMode={mode}
            logUsage={logUsage}
            onSwitchMode={setMode}
          />
        ) : (
        <>
        {/* Marketing generation banner — shown on non-marketing pages */}
        {marketingLoading && (
          <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-2xl bg-card border border-border shadow-sm animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{t("mkt.marketingGenerating")}</p>
              <p className="text-xs text-muted truncate">{marketingProgress || t("mkt.inProgressShort")}</p>
            </div>
            <button
              onClick={() => setMode("marketing")}
              className="shrink-0 px-3 py-1.5 rounded-full bg-foreground text-background text-xs font-medium hover:bg-primary-hover transition-all"
            >
              {t("mkt.view")}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left Panel — Source / Editor */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
              {mode === "inpaint" && sourceUrl
                ? t("heading.paintArea")
                : t("heading.sourceImage")}
            </h2>

            {mode === "inpaint" && sourceUrl ? (
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

            {/* Camera Controls — only in camera mode */}
            {mode === "camera" && sourceUrl && (
              <div className="space-y-4">
                <CameraOrbit
                  rotateRightLeft={rotateRightLeft}
                  moveForward={moveForward}
                  verticalAngle={verticalAngle}
                  sourceImageUrl={sourceUrl}
                  onRotateChange={setRotateRightLeft}
                  onMoveForwardChange={setMoveForward}
                  onVerticalAngleChange={setVerticalAngle}
                  disabled={loading}
                />

                {/* Compact presets row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider text-muted">
                    {t("preset.presets")}
                  </span>
                  {[
                    { label: t("preset.front"), r: 0, f: 0, v: 0 },
                    { label: t("preset.left45"), r: -45, f: 0, v: 0 },
                    { label: t("preset.right45"), r: 45, f: 0, v: 0 },
                    { label: t("preset.topDown"), r: 0, f: 0, v: -1 },
                    { label: t("preset.closeUp"), r: 0, f: 7, v: 0 },
                    { label: t("preset.lowAngle"), r: 0, f: 2, v: 0.5 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      onClick={() => {
                        setRotateRightLeft(p.r);
                        setMoveForward(p.f);
                        setVerticalAngle(p.v);
                      }}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-full bg-card border border-border text-[11px] font-medium hover:bg-card-hover hover:border-border-hover transition-all disabled:opacity-40"
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setRotateRightLeft(0);
                      setMoveForward(0);
                      setVerticalAngle(0);
                      setWideAngle(false);
                    }}
                    disabled={loading}
                    className="px-2 py-1 rounded-md text-[11px] text-muted hover:text-foreground disabled:opacity-40"
                  >
                    <RotateCcw className="w-3 h-3 inline mr-0.5" />
                    {t("preset.reset")}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel — Result */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
              {mode === "3d" ? t("heading.3dPreview") : t("heading.result")}
            </h2>

            {/* 3D Mode: show model viewer or progress */}
            {mode === "3d" ? (
              <>
                {modelUrl ? (
                  <ModelViewer modelUrl={modelUrl} />
                ) : loading && meshyTaskId ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card min-h-[320px] p-8 shadow-sm">
                    <Loader2 className="w-8 h-8 animate-spin text-foreground" />
                    <p className="text-sm font-medium mt-5">
                      {t("3d.generating")}
                    </p>
                    <p className="text-xs text-muted mt-1">
                      {meshyStatus === "PENDING"
                        ? t("3d.queued")
                        : `${t("3d.processing")} — ${meshyProgress}% ${t("3d.complete")}`}
                    </p>
                    {/* Progress bar */}
                    <div className="w-48 h-1.5 rounded-full bg-border mt-4 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-foreground transition-all duration-500"
                        style={{ width: `${meshyProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 min-h-[320px] p-8">
                    <div className="p-4 rounded-full bg-card border border-border">
                      <Box className="w-6 h-6 text-muted/30" />
                    </div>
                    <p className="text-sm text-muted mt-4">
                      {t("3d.willAppear")}
                    </p>
                    <p className="text-xs text-muted/60 mt-1">
                      {t("3d.uploadToGenerate")}
                    </p>
                  </div>
                )}

                {/* Price Estimation — shown below 3D viewer */}
                {(estimation || estimateLoading || estimateError) && (
                  <PriceEstimate
                    estimation={estimation}
                    loading={estimateLoading}
                    error={estimateError}
                  />
                )}
              </>
            ) : (
              <ResultPanel
                resultUrl={resultUrl}
                loading={loading}
                error={error}
              />
            )}

            {/* Prompt + Generate */}
            <div className="space-y-3">
              {mode !== "3d" && (
                <div>
                  <label className="text-xs font-medium text-foreground/80 mb-1.5 block">
                    {mode === "inpaint"
                      ? t("prompt.inpaint")
                      : t("prompt.camera")}
                  </label>
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                      mode === "inpaint"
                        ? t("prompt.inpaintPlaceholder")
                        : t("prompt.cameraPlaceholder")
                    }
                    className="w-full px-4 py-3 rounded-full bg-card border border-border text-sm placeholder:text-muted/50 focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 transition-all"
                    disabled={loading}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canGenerate) handleGenerate();
                    }}
                  />
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-foreground text-background font-medium text-sm hover:bg-primary-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
              >
                {loading ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    {getButtonLabel()}
                  </>
                ) : (
                  <>
                    {mode === "3d" ? (
                      <Box className="w-4 h-4" />
                    ) : (
                      <Wand2 className="w-4 h-4" />
                    )}
                    {getButtonLabel()}
                  </>
                )}
              </button>

              {/* Advanced Settings — not for 3D mode */}
              {mode !== "3d" && (
                <>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-[11px] text-muted hover:text-foreground transition-colors"
                  >
                    {showAdvanced ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                    {t("advanced.title")}
                  </button>

                  {showAdvanced && (
                    <div className="space-y-3 p-4 rounded-2xl bg-card border border-border">
                      {mode === "inpaint" && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-foreground/70">
                              {t("advanced.editStrength")}
                            </label>
                            <span className="text-[11px] font-mono text-muted">
                              {inpaintStrength}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.1}
                            max={1}
                            step={0.05}
                            value={inpaintStrength}
                            onChange={(e) =>
                              setInpaintStrength(parseFloat(e.target.value))
                            }
                            className="w-full"
                          />
                          <p className="text-[10px] text-muted/60 mt-0.5">
                            {t("advanced.editStrengthNote")}
                          </p>
                        </div>
                      )}

                      {mode === "camera" && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-foreground/70">
                              {t("advanced.effectStrength")}
                            </label>
                            <span className="text-[11px] font-mono text-muted">
                              {loraScale}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.5}
                            max={2}
                            step={0.05}
                            value={loraScale}
                            onChange={(e) =>
                              setLoraScale(parseFloat(e.target.value))
                            }
                            className="w-full"
                          />
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-foreground/70">
                            {t("advanced.quality")}
                          </label>
                          <span className="text-[11px] font-mono text-muted">
                            {steps} {t("advanced.steps")}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={mode === "inpaint" ? 10 : 4}
                          max={mode === "inpaint" ? 50 : 12}
                          step={1}
                          value={steps}
                          onChange={(e) => setSteps(parseInt(e.target.value))}
                          className="w-full"
                        />
                        <p className="text-[10px] text-muted/60 mt-0.5">
                          {t("advanced.qualityNote")}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] text-muted/50">
                        <Info className="w-3 h-3" />
                        {mode === "inpaint"
                          ? t("advanced.infoInpaint")
                          : t("advanced.infoCamera")}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <HistoryPanel
          items={history}
          onSelect={handleHistorySelect}
          onClear={() => setHistory([])}
        />
        </>
        )}
      </main>
    </div>
  );
}
