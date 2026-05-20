"use client";

import { useState, useRef } from "react";
import {
  Upload,
  Sparkles,
  Loader2,
  Film,
  Download,
  Trash2,
  Circle,
  AlertCircle,
} from "lucide-react";
import OrbitCameraControl, { OrbitParams } from "@/components/OrbitCameraControl";
import { useAuth } from "@/lib/useAuth";
import { useUsageTracking } from "@/lib/usage";
import { useI18n, TKey } from "@/lib/i18n";
import { ACTION_CREDITS } from "@/lib/credits";
import { compressImage } from "@/lib/image-compress";
import { appendHistory, useHistorySelection } from "@/lib/marketing-history";

/* ─── Motion styles ─────────────────────────────────────────────── */

interface MotionStyle {
  id: string;
  labelKey: TKey;
  descKey: TKey;
  /** English-only — fed to Kling/Seedance, not user-visible */
  prompt: string;
  /**
   * English-only music prompt fed to fal-ai/mmaudio-v2 when the user
   * toggles "auto music" on. Always commercial-instrumental — no vocals,
   * brand-safe — and tonally matched to the motion style.
   */
  musicPrompt: string;
  presetWaypoints: OrbitParams[];
}

/**
 * Optional "focus pull" intro prepended to the video prompt when the
 * user toggles 影片開頭模糊聚焦. Same English instruction regardless of
 * motion style — the style prompt that follows owns the body of the shot.
 */
const FOCUS_PULL_INTRO =
  "The video opens on softly defocused, dreamy bokeh — out-of-focus shapes " +
  "and gentle blur. Over the first 1 to 1.5 seconds, focus gradually pulls " +
  "into the product so it emerges crisp and razor-sharp, drawing the " +
  "viewer's eye into the piece before the camera move begins. Smooth, " +
  "continuous focus pull — no jump cuts.\n\n";

const MOTION_STYLES: MotionStyle[] = [
  {
    id: "cinematic-float",
    labelKey: "orbit.style.cinematicFloat",
    descKey: "orbit.style.cinematicFloat.desc",
    presetWaypoints: [
      { horizontalAngle: 0,   verticalAngle: 5,  zoom: 6 },
      { horizontalAngle: 30,  verticalAngle: 10, zoom: 5 },
      { horizontalAngle: 70,  verticalAngle: 5,  zoom: 5 },
      { horizontalAngle: 100, verticalAngle: 15, zoom: 4 },
    ],
    prompt:
      "Ultra-slow, weightless cinematic float. Camera glides with imperceptible momentum through each keyframe position, " +
      "as if suspended on a luxury cinema slider rig. Shallow depth of field with creamy bokeh in background. " +
      "Movement feels gravity-free, deliberate, and premium. Transitions are perfectly continuous — no cuts, no holds, no jumps. " +
      "Consistent studio lighting throughout. Product is perfectly stationary and centered at all times. 4K cinematic quality.",
    musicPrompt:
      "Soft, ethereal solo piano with gentle ambient pad swells underneath. Slow, weightless tempo around 60 BPM. " +
      "Cinematic, dreamy, luxury fine-jewellery or fragrance commercial atmosphere. " +
      "Light reverb, sparse arrangement, no percussion, no vocals. Brand-safe instrumental.",
  },
  {
    id: "editorial-cut",
    labelKey: "orbit.style.editorialCut",
    descKey: "orbit.style.editorialCut.desc",
    presetWaypoints: [
      { horizontalAngle: 0,  verticalAngle: 0,   zoom: 5 },
      { horizontalAngle: 90, verticalAngle: 0,   zoom: 5 },
      { horizontalAngle: 0,  verticalAngle: 80,  zoom: 6 },
      { horizontalAngle: 30, verticalAngle: -20, zoom: 4 },
    ],
    prompt:
      "Sharp, deliberate editorial jump cuts between each camera position. " +
      "Each angle holds as a composed still-life frame for 1–2 seconds before an instant hard cut to the next. " +
      "Zero motion blur between cuts. Fashion magazine aesthetic — clinical, confident, intentional.",
    musicPrompt:
      "Sharp, modern minimal electronic instrumental. Crisp piano hits punctuated by subtle synth stabs. " +
      "Confident mid-tempo around 105 BPM, fashion editorial / luxury brand commercial atmosphere. " +
      "Clean, intentional, no vocals. Brand-safe instrumental.",
  },
  {
    id: "kinetic-orbit",
    labelKey: "orbit.style.kineticOrbit",
    descKey: "orbit.style.kineticOrbit.desc",
    presetWaypoints: [
      { horizontalAngle: 0,   verticalAngle: -5,  zoom: 4 },
      { horizontalAngle: 90,  verticalAngle: -10, zoom: 4 },
      { horizontalAngle: 180, verticalAngle: 0,   zoom: 5 },
      { horizontalAngle: 270, verticalAngle: -5,  zoom: 4 },
    ],
    prompt:
      "High-energy kinetic camera movement. The camera sweeps aggressively through each waypoint with athletic momentum — " +
      "fast arcs, dynamic push-ins, forward-driving pace. Subtle motion blur on fast transitions adds speed sensation.",
    musicPrompt:
      "High-energy uplifting electronic instrumental with driving percussion and a steady four-on-the-floor pulse around 125 BPM. " +
      "Premium sports / fashion launch commercial energy — building tension, forward momentum. " +
      "No vocals, brand-safe instrumental.",
  },
  {
    id: "slow-reveal",
    labelKey: "orbit.style.slowReveal",
    descKey: "orbit.style.slowReveal.desc",
    presetWaypoints: [
      { horizontalAngle: 0,  verticalAngle: 8,  zoom: 6 },
      { horizontalAngle: 20, verticalAngle: 10, zoom: 5.5 },
      { horizontalAngle: 45, verticalAngle: 15, zoom: 5 },
      { horizontalAngle: 60, verticalAngle: 20, zoom: 4.5 },
    ],
    prompt:
      "Imperceptibly slow camera drift between each keyframe position. " +
      "Movement is so gradual it is barely perceptible — maximum tension, maximum anticipation. " +
      "Full depth of field — every micro-texture, every surface detail in perfect focus.",
    musicPrompt:
      "Ultra-slow, sparse solo piano with long sustained ambient swells. Around 50 BPM. " +
      "Builds quiet tension and anticipation — fine jewellery reveal commercial atmosphere. " +
      "Restrained, elegant, no percussion, no vocals. Brand-safe instrumental.",
  },
  {
    id: "custom",
    labelKey: "orbit.style.custom",
    descKey: "orbit.style.custom.desc",
    presetWaypoints: [],
    prompt:
      "Smooth continuous camera movement through the user-defined keyframe path. " +
      "Maintain consistent studio lighting and product stability throughout. " +
      "Interpolate naturally between each waypoint with deliberate, controlled motion. 4K cinematic quality.",
    musicPrompt:
      "Cinematic instrumental commercial soundtrack — refined, premium, neutral mid-tempo around 90 BPM. " +
      "Subtle piano with light orchestral texture. Works for any luxury product reveal. " +
      "No vocals, brand-safe instrumental.",
  },
];

/* ─── Camera presets (single still) ────────────────────────────── */

const PRESETS: { labelKey: TKey; params: OrbitParams }[] = [
  { labelKey: "orbit.preset.front",       params: { horizontalAngle: 0,  verticalAngle: 0,   zoom: 5 } },
  { labelKey: "orbit.preset.frontRight",  params: { horizontalAngle: 45, verticalAngle: 15,  zoom: 5 } },
  { labelKey: "orbit.preset.sideR",       params: { horizontalAngle: 90, verticalAngle: 0,   zoom: 5 } },
  { labelKey: "orbit.preset.topDown",     params: { horizontalAngle: 0,  verticalAngle: 85,  zoom: 6 } },
  { labelKey: "orbit.preset.lowAngle",    params: { horizontalAngle: 0,  verticalAngle: -25, zoom: 4 } },
  { labelKey: "orbit.preset.hero34",      params: { horizontalAngle: 30, verticalAngle: 20,  zoom: 4 } },
];

interface Waypoint {
  id: string;
  params: OrbitParams;
  imageUrl: string | null;
}

function angleLabel(h: number) {
  const n = ((h % 360) + 360) % 360;
  if (n <= 22 || n >= 338) return "front";
  if (n <= 67) return "front-right";
  if (n <= 112) return "right side";
  if (n <= 157) return "back-right";
  if (n <= 202) return "rear";
  if (n <= 247) return "back-left";
  if (n <= 292) return "left side";
  return "front-left";
}

/* ─── Page ──────────────────────────────────────────────────────── */

export default function OrbitPage() {
  const { user, openLogin } = useAuth();
  const { logUsage } = useUsageTracking(user?.email);
  const { t } = useI18n();

  // Upload
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Camera
  const [orbit, setOrbit] = useState<OrbitParams>({
    horizontalAngle: 45, verticalAngle: 15, zoom: 5,
  });

  // Single-still
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Video
  const [videoGenerating, setVideoGenerating] = useState(false);
  // "capturing" → still frames; "stitching" → Kling/Seedance render;
  // "scoring" → MMAudio adds music. UI shows the current step label.
  const [videoPhase, setVideoPhase] = useState<
    "capturing" | "stitching" | "scoring" | null
  >(null);
  // Optional enhancements toggled by the user
  const [focusIntro, setFocusIntro] = useState(false);
  const [addMusic, setAddMusic] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Waypoints + style
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState("cinematic-float");
  const [recordingWaypoint, setRecordingWaypoint] = useState(false);

  // Video model picker — Kling 3.0 (default, stable) vs Seedance 2 Fast
  // (newer; honors ALL waypoints as anchors, better for 3+ waypoint paths).
  type VideoModelChoice = "kling-3.0" | "seedance-2-fast";
  const [videoModel, setVideoModel] = useState<VideoModelChoice>("kling-3.0");

  // Selecting an item from the shared history strip pre-fills source.
  useHistorySelection((url) => {
    setSourceUrl(url);
    setResultUrl(null);
    setVideoUrl(null);
    setWaypoints([]);
    setError(null);
  });

  const activeStyle = MOTION_STYLES.find((s) => s.id === selectedStyleId) ?? MOTION_STYLES[0];

  // Cost preview — orbit single still costs 1 camera-generate credit;
  // motion video costs (waypointCount × camera-generate) + video-generate
  // since each waypoint is a separate FAL submission and Kling stitches.
  const stillCredits = ACTION_CREDITS["camera-generate"];
  const videoCredits = ACTION_CREDITS["video-generate"];
  const waypointCount = activeStyle.id === "custom"
    ? Math.max(1, waypoints.filter((w) => w.imageUrl !== null).length || activeStyle.presetWaypoints.length)
    : activeStyle.presetWaypoints.length;
  const motionVideoTotalCredits = waypointCount * stillCredits + videoCredits;
  const formatCredits = (n: number) =>
    t(n === 1 ? "orbit.creditsSuffix" : "orbit.creditsSuffixPlural", { n });
  const readyWaypoints = waypoints.filter((w) => w.imageUrl !== null);

  /* ─── Upload ─────────────────────────────────────────────────── */

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      // Compress oversized product photos before upload — fal/Kie reject
      // very large images with image_too_large; resizing to <= 2048px on
      // the long edge keeps quality while clearing the limit.
      const prepared = await compressImage(file);
      const fd = new FormData();
      fd.append("file", prepared);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok || !data.url) throw new Error(data.error || "Upload failed");
      setSourceUrl(data.url);
      setResultUrl(null);
      setVideoUrl(null);
      setWaypoints([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  /* ─── Single still ────────────────────────────────────────────── */

  async function handleGenerate() {
    if (!user) { openLogin(); return; }
    if (!sourceUrl) { setError("Upload a product image first"); return; }
    setLoading(true);
    setError(null);
    setResultUrl(null);
    setVideoUrl(null);

    try {
      const submit = await fetch("/api/fal/orbit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: sourceUrl,
          horizontal_angle: orbit.horizontalAngle,
          vertical_angle: orbit.verticalAngle,
          zoom: orbit.zoom,
          output_format: "png",
          num_images: 1,
        }),
      });
      const submitData = await submit.json();
      if (!submit.ok) throw new Error(submitData.error || "Submit failed");

      const requestId = submitData.request_id as string;
      const deadline = Date.now() + 3 * 60 * 1000;
      let consecutiveErrors = 0;

      while (Date.now() < deadline) {
        await new Promise((res) => setTimeout(res, 2500));
        try {
          const r = await fetch(`/api/fal/orbit?request_id=${encodeURIComponent(requestId)}`);
          const pollData = (await r.json()) as { status: string; images?: { url: string }[]; error?: string };
          consecutiveErrors = 0;
          if (pollData.status === "success" && pollData.images?.[0]?.url) {
            setResultUrl(pollData.images[0].url);
            logUsage?.("camera-generate", { status: "success", detail: `${orbit.horizontalAngle}/${orbit.verticalAngle}/${orbit.zoom}` });
            appendHistory({
              id: crypto.randomUUID(),
              sourceUrl: sourceUrl ?? "",
              resultUrl: pollData.images[0].url,
              mode: "camera",
              settings: {
                rotate: orbit.horizontalAngle,
                forward: orbit.zoom,
                vertical: orbit.verticalAngle,
                wide: false,
                prompt: `Orbit ${orbit.horizontalAngle}°/${orbit.verticalAngle}° · ${orbit.zoom.toFixed(1)}×`,
              },
              timestamp: Date.now(),
            });
            return;
          }
          if (pollData.status === "fail") throw new Error(pollData.error || "Generation failed");
        } catch (e) {
          if (++consecutiveErrors >= 3) throw e;
        }
      }
      throw new Error("Timed out after 3 minutes");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      setError(msg);
      logUsage?.("camera-generate", { status: "error", detail: msg });
    } finally {
      setLoading(false);
    }
  }

  /* ─── Capture a single waypoint (manual or auto-preset) ───────── */

  async function captureWaypointImage(params: OrbitParams): Promise<string | null> {
    if (!sourceUrl) return null;
    try {
      const submit = await fetch("/api/fal/orbit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: sourceUrl,
          horizontal_angle: params.horizontalAngle,
          vertical_angle: params.verticalAngle,
          zoom: params.zoom,
          output_format: "png",
          num_images: 1,
        }),
      });
      const submitData = await submit.json();
      if (!submit.ok || !submitData.request_id) {
        throw new Error(submitData.error || "Submit failed");
      }
      const deadline = Date.now() + 3 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const r = await fetch(`/api/fal/orbit?request_id=${encodeURIComponent(submitData.request_id)}`);
        const data = (await r.json()) as { status: string; images?: { url: string }[]; error?: string };
        if (data.status === "success") return data.images?.[0]?.url ?? null;
        if (data.status === "fail") throw new Error(data.error || "Capture failed");
      }
      throw new Error("Timed out");
    } catch (e) {
      console.error("[orbit] captureWaypointImage failed:", e);
      return null;
    }
  }

  /* ─── Manual waypoint recording (Custom Path) ─────────────────── */

  async function handleRecordWaypoint() {
    if (!user) { openLogin(); return; }
    if (!sourceUrl) { setError("Upload a product image first"); return; }
    if (waypoints.length >= 4) return;
    setRecordingWaypoint(true);
    setError(null);
    const id = `wp-${crypto.randomUUID()}`;
    const placeholder: Waypoint = { id, params: { ...orbit }, imageUrl: null };
    setWaypoints((prev) => [...prev, placeholder]);
    try {
      const img = await captureWaypointImage(orbit);
      if (img) {
        setWaypoints((prev) =>
          prev.map((w) => (w.id === id ? { ...w, imageUrl: img } : w))
        );
      } else {
        setWaypoints((prev) => prev.filter((w) => w.id !== id));
        throw new Error("Waypoint capture failed — try a different angle");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Waypoint capture failed");
    } finally {
      setRecordingWaypoint(false);
    }
  }

  function clearWaypoints() {
    setWaypoints([]);
  }

  /* ─── Motion video ────────────────────────────────────────────── */

  async function handleGenerateVideo() {
    if (!user) { openLogin(); return; }
    if (!sourceUrl) { setError("Upload a product image first"); return; }

    setVideoGenerating(true);
    setVideoPhase("capturing");
    setVideoUrl(null);
    setResultUrl(null);
    setError(null);

    try {
      let activeWaypoints: { params: OrbitParams; imageUrl: string }[];

      if (activeStyle.id === "custom") {
        const ready = waypoints.filter((w): w is Waypoint & { imageUrl: string } => w.imageUrl !== null);
        if (ready.length < 2) {
          throw new Error("Record at least 2 waypoints for the custom path");
        }
        activeWaypoints = ready.map((w) => ({ params: w.params, imageUrl: w.imageUrl }));
      } else {
        // Seed placeholders so user sees per-waypoint progress
        const placeholders: Waypoint[] = activeStyle.presetWaypoints.map((params) => ({
          id: `preset-${crypto.randomUUID()}`,
          params,
          imageUrl: null,
        }));
        setWaypoints(placeholders);

        const captured = await Promise.all(
          placeholders.map(async (p) => {
            const img = await captureWaypointImage(p.params);
            if (img) {
              setWaypoints((prev) => prev.map((w) => (w.id === p.id ? { ...w, imageUrl: img } : w)));
            }
            return img ? { params: p.params, imageUrl: img } : null;
          })
        );
        const ok = captured.filter((w): w is { params: OrbitParams; imageUrl: string } => w !== null);
        if (ok.length < 2) {
          throw new Error("Couldn't capture enough preset waypoints — try a different image");
        }
        activeWaypoints = ok;
      }

      setVideoPhase("stitching");

      const pathDesc = activeWaypoints
        .map((w, i) => `W${i + 1}: ${angleLabel(w.params.horizontalAngle)} (${w.params.horizontalAngle}°)`)
        .join(" → ");
      // Optional focus-pull intro is prepended verbatim — the style prompt
      // still owns the body shot. Kling/Seedance interpret both halves.
      const introPart = focusIntro ? FOCUS_PULL_INTRO : "";
      const fullPrompt = `${introPart}${activeStyle.prompt}\n\nCamera path: ${pathDesc}.`;
      const waypointUrls = activeWaypoints.map((w) => w.imageUrl);

      const videoSubmit = await fetch("/api/kie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "video",
          video_model: videoModel,                   // "kling-3.0" or "seedance-2-fast"
          prompt: fullPrompt,
          reference_images: waypointUrls,            // /api/kie translates per model
          aspect_ratio: "1:1",
          duration: 5,                               // Seedance honors; Kling ignores
          generate_audio: false,                     // Seedance perf override
        }),
      });
      const submitData = await videoSubmit.json();
      if (!videoSubmit.ok || !submitData.taskId) {
        throw new Error(submitData.error || `No taskId from ${videoModel}`);
      }

      const deadline = Date.now() + 6 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        const r = await fetch(`/api/kie?taskId=${encodeURIComponent(submitData.taskId)}&type=video`);
        const poll = (await r.json()) as { status: string; videos?: { url: string }[]; error?: string };
        if (poll.status === "success" && poll.videos?.[0]?.url) {
          let finalVideoUrl = poll.videos[0].url;

          // Optional step 3 — add commercial music matched to motion style
          // via fal-ai/mmaudio-v2. Don't fail the whole job if scoring
          // errors out: ship the silent video as a fallback so the user
          // still gets something.
          if (addMusic) {
            setVideoPhase("scoring");
            try {
              const mmRes = await fetch("/api/fal/mmaudio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  video_url: finalVideoUrl,
                  prompt: activeStyle.musicPrompt,
                  duration: 6,
                }),
              });
              const mmData = await mmRes.json();
              if (mmRes.ok && mmData.url) {
                finalVideoUrl = mmData.url;
              } else {
                console.warn("[orbit] music scoring failed:", mmData.error);
                setError(
                  `配樂失敗，已輸出無音樂版本：${mmData.error ?? "unknown"}`
                );
              }
            } catch (e) {
              console.warn("[orbit] music scoring network error:", e);
              setError("配樂失敗，已輸出無音樂版本。");
            }
          }

          setVideoUrl(finalVideoUrl);
          logUsage?.("video-generate", { status: "success", detail: `orbit-${activeStyle.id}` });
          appendHistory({
            id: crypto.randomUUID(),
            sourceUrl: sourceUrl ?? "",
            resultUrl: finalVideoUrl,
            mode: "video",
            settings: {
              rotate: 0,
              forward: 0,
              vertical: 0,
              wide: false,
              prompt: `Orbit · ${t(activeStyle.labelKey)} · ${activeWaypoints.length} waypoints${
                focusIntro ? " · focus pull" : ""
              }${addMusic ? " · scored" : ""}`,
            },
            timestamp: Date.now(),
          });
          return;
        }
        if (poll.status === "fail") throw new Error(poll.error || "Kling 3.0 video generation failed");
      }
      throw new Error("Orbit video timed out after 6 minutes");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Video generation failed";
      setError(msg);
      logUsage?.("video-generate", { status: "error", detail: msg });
    } finally {
      setVideoGenerating(false);
      setVideoPhase(null);
    }
  }

  /* ─── Render ──────────────────────────────────────────────────── */

  const customBlocked = activeStyle.id === "custom" && readyWaypoints.length < 2;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* LEFT: Controls */}
      <div className="space-y-5">
        {/* Upload */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
            {t("orbit.productImage")}
          </h3>
          {!sourceUrl ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex flex-col items-center justify-center gap-2 py-12 rounded-xl border-2 border-dashed border-border hover:border-accent/40 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted" />
              ) : (
                <Upload className="w-5 h-5 text-muted" />
              )}
              <p className="text-xs text-muted">
                {uploading ? t("orbit.uploading") : t("orbit.uploadProductImage")}
              </p>
            </button>
          ) : (
            <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-border bg-background">
              <img src={sourceUrl} alt="" className="w-full h-full object-contain" />
              <button
                onClick={() => { setSourceUrl(null); setResultUrl(null); setVideoUrl(null); setWaypoints([]); }}
                className="absolute top-2 right-2 px-2 py-1 rounded-full bg-black/60 text-white text-[10px] font-medium"
              >
                {t("orbit.replace")}
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
          />
        </section>

        {/* Camera angle */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
            {t("orbit.cameraAngle")}
          </h3>
          <OrbitCameraControl
            value={orbit}
            onChange={setOrbit}
            productImageUrl={sourceUrl}
            disabled={loading || videoGenerating || recordingWaypoint}
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-[10px] uppercase tracking-wider text-muted self-center">{t("orbit.presets")}</span>
            {PRESETS.map((p) => (
              <button
                key={p.labelKey}
                onClick={() => setOrbit(p.params)}
                disabled={loading || videoGenerating || recordingWaypoint}
                className="px-3 py-1.5 rounded-full bg-background border border-border text-[11px] font-medium hover:border-accent/30 disabled:opacity-40"
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>
        </section>

        {/* Motion style */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
            {t("orbit.motionStyle")}
          </h3>
          <p className="text-[11px] text-muted mb-3">
            {t("orbit.motionHint")}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MOTION_STYLES.map((style) => {
              const isSel = style.id === selectedStyleId;
              const isCustom = style.id === "custom";
              return (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyleId(style.id)}
                  className={`p-2.5 rounded-xl border text-left transition-colors ${
                    isSel ? "border-accent bg-accent/10" : "border-border hover:border-accent/30"
                  } ${isCustom ? "border-dashed" : ""}`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-semibold">{t(style.labelKey)}</span>
                    {isCustom && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-accent/15 text-accent font-bold tracking-wider">
                        {t("orbit.manualBadge")}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted leading-tight">
                    {t(style.descKey)}
                  </div>
                  {!isCustom && (
                    <div className="text-[9px] text-muted/70 mt-1">
                      {t("orbit.autoShots", { n: style.presetWaypoints.length })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Waypoints panel — visible whenever we have waypoints to show
            (preset capture in progress OR Custom Path), and idle-empty
            only for Custom (presets seed waypoints automatically). */}
        {(activeStyle.id === "custom" || waypoints.length > 0) && (
          <section className="rounded-2xl border border-dashed border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t("orbit.waypoints")} ({readyWaypoints.length}/{Math.max(4, waypoints.length)})
              </h3>
              {waypoints.length > 0 && activeStyle.id === "custom" && (
                <button
                  onClick={clearWaypoints}
                  className="flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
                >
                  <Trash2 className="w-3 h-3" /> {t("orbit.waypointsClear")}
                </button>
              )}
            </div>
            {waypoints.length === 0 ? (
              <p className="text-[11px] text-muted text-center py-4">
                {t("orbit.waypointsEmpty")}
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 mb-3">
                {waypoints.map((w, i) => (
                  <div key={w.id} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-background">
                    {w.imageUrl ? (
                      <img src={w.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-muted" />
                      </div>
                    )}
                    <span className="absolute top-1 left-1 text-[9px] px-1 py-0.5 rounded bg-black/60 text-white font-bold">
                      W{i + 1}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* Manual record button only for Custom Path */}
            {activeStyle.id === "custom" && (
            <button
              onClick={handleRecordWaypoint}
              disabled={recordingWaypoint || waypoints.length >= 4 || !sourceUrl}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-accent/30 text-accent text-xs font-medium hover:bg-accent/10 disabled:opacity-40"
            >
              {recordingWaypoint ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Circle className="w-3.5 h-3.5" />}
              {recordingWaypoint
                ? t("orbit.waypointsCapturing")
                : waypoints.length === 0
                ? t("orbit.waypointsRecordFirst")
                : t("orbit.waypointsAddNext", { n: waypoints.length + 1 })}
            </button>
            )}
          </section>
        )}

        {/* Generation actions */}
        <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <button
            onClick={handleGenerate}
            disabled={loading || videoGenerating || recordingWaypoint || !sourceUrl}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading
              ? t("orbit.generatingImage")
              : `${t("orbit.generateImage")} · ${formatCredits(stillCredits)}`}
          </button>
          <p className="text-[10px] text-muted text-center -mt-2">
            {t("orbit.generateImageHint")}
          </p>

          {/* Video model picker */}
          <div className="pt-1">
            <label className="text-[10px] uppercase tracking-wider text-muted block mb-1.5">
              {t("orbit.videoModel")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "kling-3.0" as const, labelKey: "orbit.model.kling" as TKey, tagKey: "orbit.model.kling.tag" as TKey },
                { id: "seedance-2-fast" as const, labelKey: "orbit.model.seedance" as TKey, tagKey: "orbit.model.seedance.tag" as TKey },
              ]).map((m) => {
                const isSel = videoModel === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setVideoModel(m.id)}
                    disabled={videoGenerating || loading || recordingWaypoint}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-[11px] transition-colors disabled:opacity-50 ${
                      isSel
                        ? "border-foreground bg-foreground/5 font-semibold"
                        : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <span>{t(m.labelKey)}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-medium">
                      {t(m.tagKey)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted mt-1.5">
              {t("orbit.videoModelHint")}
            </p>
          </div>

          {/* Optional enhancement toggles */}
          <div className="space-y-2 mb-4 p-3 rounded-xl bg-muted/5 border border-border">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">
              {t("orbit.enhance")}
            </p>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={focusIntro}
                onChange={(e) => setFocusIntro(e.target.checked)}
                className="mt-0.5 accent-foreground"
                disabled={videoGenerating}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground leading-tight">
                  {t("orbit.focusPull")}
                </p>
                <p className="text-[10px] text-muted mt-0.5 leading-snug">
                  {t("orbit.focusPullHint")}
                </p>
              </div>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={addMusic}
                onChange={(e) => setAddMusic(e.target.checked)}
                className="mt-0.5 accent-foreground"
                disabled={videoGenerating}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground leading-tight">
                  {t("orbit.autoMusic")}
                </p>
                <p className="text-[10px] text-muted mt-0.5 leading-snug">
                  {t("orbit.autoMusicHint")}
                </p>
              </div>
            </label>
          </div>

          <button
            onClick={handleGenerateVideo}
            disabled={videoGenerating || loading || recordingWaypoint || !sourceUrl || customBlocked}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border-2 border-foreground text-foreground text-sm font-semibold hover:bg-foreground/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {videoGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
            {videoGenerating
              ? videoPhase === "capturing"
                ? t("orbit.videoCapturingPhase", { n: activeStyle.presetWaypoints.length || readyWaypoints.length })
                : videoPhase === "scoring"
                ? t("orbit.videoScoringPhase")
                : t("orbit.videoStitchingPhase")
              : customBlocked
              ? t("orbit.waypointsNeedMore", { n: 2 - readyWaypoints.length })
              : `${
                  activeStyle.id === "custom"
                    ? t("orbit.videoCustom")
                    : t("orbit.videoPreset", { style: t(activeStyle.labelKey) })
                } · ${formatCredits(motionVideoTotalCredits)}`}
          </button>
          <p className="text-[10px] text-muted text-center -mt-2">
            {activeStyle.id === "custom"
              ? t("orbit.videoCustomHint")
              : t("orbit.videoPresetHint", { n: activeStyle.presetWaypoints.length })}
          </p>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </section>
      </div>

      {/* RIGHT: Result */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{t("orbit.result")}</h3>
        <div className="aspect-square rounded-2xl border border-border bg-card overflow-hidden flex items-center justify-center">
          {videoUrl ? (
            <video src={videoUrl} className="w-full h-full object-contain" controls autoPlay loop />
          ) : resultUrl ? (
            <img src={resultUrl} alt="result" className="w-full h-full object-contain" />
          ) : videoGenerating || loading ? (
            <div className="flex flex-col items-center gap-2 text-muted">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-xs">
                {videoGenerating
                  ? videoPhase === "capturing"
                    ? t("orbit.capturingWaypoints")
                    : t("orbit.stitchingMotion")
                  : t("orbit.renderingAngle")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted px-6 text-center">
              <p className="text-xs">{t("orbit.placeholder")}</p>
            </div>
          )}
        </div>
        {videoUrl && (
          <a
            href={videoUrl}
            download="orbit-video.mp4"
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border bg-card hover:bg-background text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            {t("orbit.downloadMp4")}
          </a>
        )}
      </div>
    </div>
  );
}
