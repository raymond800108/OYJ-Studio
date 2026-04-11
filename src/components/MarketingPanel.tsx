"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Image,
  Video,
  Sparkles,
  RefreshCw,
  Loader2,
  Download,
  Play,
  X,
  Upload,
  Clock,
  Maximize2,
  Plus,
} from "lucide-react";
import type { HistoryItem } from "./HistoryPanel";
import TemplatePreview from "./TemplatePreview";
import { useI18n } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import type { ApiAction } from "@/lib/usage";

// ── Studio prompt templates (extracted from Prompterio Bracelets PDF) ────────

interface Template {
  id: string;
  label: string;
  icon: string;
  description: string;
  prompt: string;
  dynamic?: boolean;
}

// Prefix prepended to every template prompt to enforce product consistency
const CONSISTENCY_PREFIX =
  "CRITICAL: The generated image MUST feature the EXACT same jewelry piece shown in the reference image. Preserve every detail of the original product — its exact shape, design, gemstones, metal color, proportions, and craftsmanship. Do NOT substitute, alter, or replace the jewelry with a different piece. The product identity must be perfectly maintained. ";

const TEMPLATES = [
  {
    id: "glass-display",
    label: "Glass Display Box",
    icon: "🔮",
    description: "Museum-grade glass showcase on polished marble base with soft highlights",
    prompt:
      "Create a hyper-real, ultra high-resolution photograph of the exact jewelry piece from the reference image displayed inside a crystal-clear, museum-grade glass showcase. The jewelry rests elegantly on a polished black marble stone base with natural white veining, subtly reflecting light to enhance the richness of the piece. Capture in extreme close-up, revealing intricate craftsmanship, precision-cut details, refined textures, and a flawless finish. Use cinematic studio lighting with soft highlights and controlled shadows to emphasize depth, brilliance, and material quality. The surrounding environment should feel like a high-end luxury boutique or private jewellery gallery, minimal yet opulent, with a shallow depth of field ensuring the jewelry remains the central attraction. Hyper-realism, 8K quality, photoreal textures, luxury advertising aesthetic.",
  },
  {
    id: "natural-surface",
    label: "Natural Surface",
    icon: "🪨",
    description: "Raw stone, marble, sand or wood surface with organic texture contrast",
    prompt:
      "Create a hyper-real, ultra high-resolution studio photograph of the exact jewelry piece from the reference image placed directly on a raw natural stone surface with subtle textures and organic imperfections. The rugged matte finish of the stone contrasts sharply with the refined polish and intricate craftsmanship of the jewelry. Capture extreme close-up details showcasing fine engravings, precise metalwork, gemstone clarity, and flawless finish. Use professional studio lighting with soft directional highlights and controlled shadows to enhance depth, texture, and brilliance. The background should remain minimal and unobtrusive, allowing the jewelry to dominate the frame. Shot on a high-end professional camera with perfect exposure, sharp focus, and cinematic depth of field, delivering a refined luxury editorial aesthetic.",
  },
  {
    id: "dark-dramatic",
    label: "Dark & Dramatic",
    icon: "🌑",
    description: "Deep black backdrop with bold directional key light and crisp highlights",
    prompt:
      "Create a hyper-real, ultra high-resolution studio photograph of the exact jewelry piece from the reference image placed against a deep black, seamless yet creative and premium studio background. Use a strong directional key light to create crisp highlights that accentuate polished metal, gemstone brilliance, and intricate craftsmanship. Allow controlled shadows to fall naturally, adding drama and depth without losing detail. Capture extreme close-up clarity revealing fine engravings, sharp edges, and reflective surfaces. The image should feel bold, powerful, and refined, shot on a high-end professional camera with perfect exposure, high contrast, and a shallow depth of field, delivering a dramatic luxury advertising aesthetic.",
  },
  {
    id: "floating-abstract",
    label: "Creative Floating",
    icon: "✧",
    description: "Levitating mid-air with soft shadow beneath, weightless artistic composition",
    prompt:
      "A high quality studio photo of the exact jewelry piece from the reference image appearing to hover just millimeters between two jagged slabs of raw, white Carrera marble. The entire piece is visible in an extreme closeup, with the camera at a very low angle, looking up through the \"canyon\" of the rock. The background is a hazy, soft-focus gold. Lighting is a mix of warm and cool tones, with a blue-gelled rim light on the marble and a warm key light on the product. Inspired by the nature-meets-architecture campaigns of Bvlgari. Camera: Sony A1, 90mm Macro, f/16, ISO 100. The contrast between the unrefined stone and the floating, pristine jewelry creates a sophisticated, earth-grounded luxury.",
  },
  {
    id: "clean-neutral",
    label: "Clean & Neutral",
    icon: "◻",
    description: "Pure white or soft neutral seamless background with balanced studio lighting",
    prompt:
      "A high quality studio photo of the exact jewelry piece from the reference image positioned in the center on a monochrome pedestal. The background is a solid, warm sand-colored studio wall. The lighting is diffused through the scene, creating a soft, ethereal glow on the product's surface. Shot using a Fujifilm GFX 100S, 110mm lens, f/5.6 to create a gentle fall-off in focus. Inspired by the delicate, tactile campaigns of Hermès, this uses shadows to create depth and interest, ensuring the composition is unique and premium while maintaining a grounded, realistic atmosphere.",
  },
  {
    id: "elemental-artistic",
    label: "Elemental & Artistic",
    icon: "💧",
    description: "Water droplets, smoke wisps or prism light refractions around the piece",
    prompt:
      "A high quality studio photo of the exact jewelry piece from the reference image positioned on heap of thin fine white silica sand, creating a small \"mountains\" of sand around the product. The background is a warm, out-of-focus beige. Photographed with a Sony A1, 90mm Macro, f/11, 1/2000s. Lighting is a hard side-light to emphasize the individual grains of sand and the sparkle of the product. This elemental shot is inspired by the \"passage of time\" concepts in high-end watchmaking, creating a tactile, detailed, and unique scene that feels both artistic and grounded in reality. Isometric top view.",
  },
  {
    id: "detail-closeup",
    label: "Detail Close-Up",
    icon: "🔍",
    description: "Extreme macro focus on engravings, metal joins and gemstone settings",
    prompt:
      "Create a hyper-real, ultra high-resolution studio photograph of the exact jewelry piece from the reference image captured in extreme macro close-up. Focus tightly on the intricate craftsmanship, revealing fine engravings, precise metal joins, gemstone settings, and surface polish. Use controlled studio lighting to create crisp highlights and soft shadows that enhance texture and depth without glare. The background should be minimal and unobtrusive, allowing every micro-detail to stand out. Shot on a professional high-end camera with a macro lens, perfect focus stacking, and flawless exposure for a refined luxury editorial look.",
  },
  {
    id: "packaging-box",
    label: "Packaging Box",
    icon: "🎁",
    description: "Inside an open luxury jewellery box with plush cushion interior",
    prompt:
      "Create a hyper-real, ultra high-resolution studio photograph of the exact jewelry piece from the reference image elegantly placed inside an open rigid jewellery box with a soft, plush cushion interior. The jewelry rests naturally, following the contours of the cushion, highlighting its craftsmanship, polished metal, and gemstone brilliance. Use controlled studio lighting to create refined highlights and gentle shadows that enhance depth and texture. The exterior of the box should feel minimal and luxurious, with a clean background that keeps attention on the jewellery. Shot on a professional high-end camera with perfect exposure, sharp focus, and cinematic depth of field for a refined luxury brand aesthetic.",
  },
  {
    id: "natural-branches",
    label: "Natural Branches",
    icon: "🌿",
    description: "Draped over sculptural tree branch with organic curves and bark texture",
    prompt:
      "Create a hyper-real, ultra high-resolution studio photograph of the exact jewelry piece from the reference image gently draped over a sculptural natural tree branch with organic curves and subtle texture. The contrast between the raw, matte bark and the polished metal and stones enhances the craftsmanship and shine. Use controlled studio lighting to highlight intricate details, reflective surfaces, and gemstone brilliance while preserving natural shadows. The background should remain soft and neutral yet creative, keeping full focus on the jewellery. Shot on a professional high-end camera with perfect exposure, sharp focus, and cinematic depth of field, delivering a refined natural luxury aesthetic.",
  },
  {
    id: "vintage-inspired",
    label: "Vintage Heritage",
    icon: "📜",
    description: "Classic heritage setting with aged linen, warm tones and old-world elegance",
    prompt:
      "Create a hyper-real, high-resolution studio photograph of the exact jewelry piece from the reference image styled in a classic heritage-inspired setting. The jewelry is placed on a softly textured vintage surface, such as aged linen or fine parchment tones, evoking old-world elegance. Use warm, directional studio lighting to create gentle highlights and natural shadows that emphasize craftsmanship, engraved details, and metal finish. Color tones should feel slightly warm and muted, with refined contrast. Shot on a professional high-end camera with precise exposure and sharp focus, delivering a timeless luxury jewellery image.",
  },
  {
    id: "moss-rock",
    label: "Moss & Rock",
    icon: "🌿",
    description: "Nestled on moss-covered rock with soft cream background, editorial top view",
    prompt:
      "A high quality studio photo of the exact jewelry piece from the reference image nestled on top of a rock that is covered in thick dense moss. The background is a soft, neutral cream. Captured with a Canon EOS R5, 100mm Macro, f/5.6 for a beautiful, shallow depth of field. Lighting is a large silk scrim for a soft, fashion-editorial glow. Inspired by the minimalist floral work of Robert Mapplethorpe, this prompt uses the moss growth to frame the product, creating a sophisticated, high-end, and incredibly elegant composition that feels unique and timeless. Top view isometric angle.",
  },
  {
    id: "consistent-model",
    label: "Consistent Model",
    icon: "👤",
    description: "Same model character wears all your jewelry — upload character reference first",
    prompt: "__CONSISTENT_MODEL__",
    dynamic: true,
  },
  {
    id: "consistent-wearing",
    label: "Consistent Wearing",
    icon: "💎",
    description: "Source image shows jewelry already worn correctly — reproduce the EXACT wearing style with your model's face and clothes",
    prompt: "__CONSISTENT_WEARING__",
    dynamic: true,
  },
  {
    id: "white-background",
    label: "Clean White Studio",
    icon: "⬜",
    description: "Transforms any messy photo into a clean white background product shot",
    prompt:
      "ABSOLUTE STRICT RULE: The jewelry piece in the generated image must be a PIXEL-PERFECT, IDENTICAL reproduction of the EXACT product from the reference image. Do NOT alter, reimagine, redesign, simplify, or change ANY detail whatsoever — every single gemstone, every prong, every engraving, every curve, every metal texture, every setting, every proportion, every color, every scratch, every imperfection must be preserved EXACTLY as shown in the reference. The product must look like the SAME physical object photographed again, not a similar or inspired version. Zero creative liberty on the product itself. " +
      "Create a hyper-real, ultra high-resolution professional e-commerce product photograph of this EXACT jewelry piece. Place it on a pure, seamless white background with absolutely no distractions, shadows from surroundings, or background elements. The piece should be perfectly centered, photographed from the SAME angle as the reference image, well-lit with soft diffused studio lighting from multiple angles to eliminate harsh shadows. Remove ALL original background clutter, textures, surfaces, and environmental elements — replace everything with a perfectly clean, bright white studio backdrop. The jewelry must appear as if the SAME physical piece was moved into a professional product photography studio with a white cyclorama and re-photographed. Maintain razor-sharp focus on every detail — metal finish, gemstone clarity, engravings, surface reflections, patina, and wear marks must ALL match the reference EXACTLY. Use professional color-accurate lighting with a slight warm fill to enhance metal tones. Camera: Phase One IQ4, 120mm macro, f/11, ISO 50, focus-stacked for edge-to-edge sharpness. The final image should be suitable for luxury e-commerce, catalog, or website hero usage. Pure white background, no shadows on background, product only. REMINDER: The product must be IDENTICAL to the reference — same piece, same design, same details, no changes.",
  },
] as Template[];

// ── Types ────────────────────────────────────────────────────────────────────

type ContentType = "image" | "video";

interface SourceImage {
  id: string;
  url: string;
  file: File | null;
}

interface GeneratedImage {
  url: string;
  sourceId?: string; // which source image produced this
}

interface GeneratedVideo {
  url: string;
  duration?: string;
}

// Track individual task per source image
interface TaskInfo {
  sourceId: string;
  sourceUrl: string;
  taskId: string;
  status: string;
  taskType: "image" | "video"; // actual API type used when creating this task
}

// ── Aspect ratios ────────────────────────────────────────────────────────────

const IMAGE_RATIOS = [
  { value: "1:1", label: "1:1 Square" },
  { value: "4:3", label: "4:3 Landscape" },
  { value: "3:4", label: "3:4 Portrait" },
  { value: "16:9", label: "16:9 Wide" },
  { value: "9:16", label: "9:16 Story" },
  { value: "2:3", label: "2:3 Tall" },
  { value: "3:2", label: "3:2 Wide" },
];

const VIDEO_RATIOS = [
  { value: "16:9", label: "16:9 Landscape" },
  { value: "9:16", label: "9:16 Story/Reel" },
  { value: "1:1", label: "1:1 Square" },
];

// ── Component ────────────────────────────────────────────────────────────────

interface MarketingPanelProps {
  history: HistoryItem[];
  onAddHistory: (item: HistoryItem) => void;
  sharedResults: string[];
  onSharedResults: (urls: string[]) => void;
  onLoadingChange: (loading: boolean) => void;
  onProgressChange: (progress: string) => void;
  otherPageLoading: boolean;
  otherPageMode: string;
  onSwitchMode: (mode: "camera" | "inpaint" | "3d" | "marketing" | "usage") => void;
  logUsage?: (action: ApiAction, opts?: { status?: "success" | "error"; tokensIn?: number; tokensOut?: number; costOverride?: number; detail?: string }) => void;
}

export default function MarketingPanel({
  history,
  onAddHistory,
  sharedResults,
  onSharedResults,
  onLoadingChange,
  onProgressChange,
  otherPageLoading,
  otherPageMode,
  onSwitchMode,
  logUsage,
}: MarketingPanelProps) {
  const { t } = useI18n();

  // Content type
  const [contentType, setContentType] = useState<ContentType>("image");

  // Multiple source images
  const [sourceImages, setSourceImages] = useState<SourceImage[]>([]);

  // Character model reference images (for consistent model feature)
  const [characterImages, setCharacterImages] = useState<SourceImage[]>([]);
  const [characterDropOver, setCharacterDropOver] = useState(false);
  const characterInputRef = useRef<HTMLInputElement>(null);

  // Outfit reference images + description
  const [outfitImages, setOutfitImages] = useState<SourceImage[]>([]);
  const [outfitDropOver, setOutfitDropOver] = useState(false);
  const outfitInputRef = useRef<HTMLInputElement>(null);
  const [outfitDescription, setOutfitDescription] = useState("");

  // Template selection
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Settings
  const [aspectRatio, setAspectRatio] = useState("4:3");
  const [videoModel, setVideoModel] = useState<string>("kling-2.6");
  const [jewelryDimension, setJewelryDimension] = useState("");

  // Generation state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTasks, setActiveTasks] = useState<TaskInfo[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [generatedVideo, setGeneratedVideo] = useState<GeneratedVideo | null>(null);
  const [maximizedImage, setMaximizedImage] = useState<string | null>(null);
  // For consistent-model video: user picks a generated image as video base
  const [videoBaseImage, setVideoBaseImage] = useState<string | null>(null);
  const [videoFromImageLoading, setVideoFromImageLoading] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceDropOver, setSourceDropOver] = useState(false);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Sync loading & progress to parent so other pages can show indicator
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    onLoadingChange(loading);
    // When loading finishes, share results to other pages
    if (prevLoadingRef.current && !loading && generatedImages.length > 0) {
      const urls = generatedImages.map((i) => i.url);
      onSharedResults(urls);
      prevSharedRef.current = urls;
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const pending = activeTasks.length;
    const done = generatedImages.length;
    if (loading && pending > 0) {
      onProgressChange(`Generating... (${done} done, ${pending} remaining)`);
    } else if (loading) {
      onProgressChange("Starting generation...");
    }
  }, [loading, activeTasks.length, generatedImages.length]);

  // Sync generated images from other pages via sharedResults
  const prevSharedRef = useRef<string[]>([]);
  useEffect(() => {
    if (
      sharedResults.length > 0 &&
      JSON.stringify(sharedResults) !== JSON.stringify(prevSharedRef.current)
    ) {
      prevSharedRef.current = sharedResults;
      setGeneratedImages(sharedResults.map((url) => ({ url })));
    }
  }, [sharedResults]);

  // Poll all active tasks
  useEffect(() => {
    if (activeTasks.length === 0) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    const poll = async () => {
      const stillActive: TaskInfo[] = [];

      for (const task of activeTasks) {
        try {
          const res = await fetch(`/api/kie?taskId=${task.taskId}&type=${task.taskType}`);
          const data = await res.json();

          // Treat transient network errors as retryable — keep polling
          if (data.error && (data.error === "fetch failed" || data.error.includes("fetch") || res.status >= 500)) {
            stillActive.push(task);
            continue;
          }

          if (data.error && data.status !== "generating" && data.status !== "waiting" && data.status !== "queuing") {
            setError((prev) => prev ? `${prev}\n${data.error}` : data.error);
            continue; // Drop this task — genuine API error
          }

          if (data.status === "success") {
            if (data.images && data.images.length > 0) {
              const newImages = data.images.map((img: { url: string }) => ({
                url: img.url,
                sourceId: task.sourceId,
              }));
              setGeneratedImages((prev) => [...prev, ...newImages]);
              // Add to history
              data.images.forEach((img: { url: string }) => {
                onAddHistory({
                  id: crypto.randomUUID(),
                  sourceUrl: task.sourceUrl,
                  resultUrl: img.url,
                  mode: "camera",
                  settings: { rotate: 0, forward: 0, vertical: 0, wide: false, prompt: "" },
                  timestamp: Date.now(),
                });
              });
            }
            if (data.videos && data.videos.length > 0) {
              setGeneratedVideo(data.videos[0]);
            }
            continue; // Task done, don't keep it active
          } else if (data.status === "fail") {
            setError((prev) => prev ? `${prev}\nFailed for one image` : "Generation failed for one image");
            continue;
          }

          // Still in progress
          stillActive.push({ ...task, status: data.status });
        } catch {
          stillActive.push(task); // Keep polling on network error
        }
      }

      setActiveTasks(stillActive);
      if (stillActive.length === 0) {
        setLoading(false);
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activeTasks.length > 0 ? JSON.stringify(activeTasks.map(t => t.taskId)) : "none"]);

  // Add a source image from URL
  const addSourceFromUrl = useCallback((url: string, file: File | null) => {
    setSourceImages((prev) => {
      // Don't add duplicates
      if (prev.some((s) => s.url === url)) return prev;
      return [...prev, { id: crypto.randomUUID(), url, file }];
    });
  }, []);

  // Remove a source image
  const removeSource = useCallback((id: string) => {
    setSourceImages((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Handle file input (browse)
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      const localUrl = URL.createObjectURL(file);
      addSourceFromUrl(localUrl, file);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [addSourceFromUrl]);

  // Handle drop on source area
  const handleSourceDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setSourceDropOver(false);

    // Check for history item drop
    const historyData = e.dataTransfer.getData("application/x-history-item");
    const droppedUrl = e.dataTransfer.getData("text/plain");

    if (historyData || (droppedUrl && droppedUrl.startsWith("http"))) {
      const url = historyData ? JSON.parse(historyData).resultUrl : droppedUrl;
      // Remote URL — store directly, uploadForReference will pass it through
      addSourceFromUrl(url, null);
      return;
    }

    // Normal file drop (can be multiple)
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      const localUrl = URL.createObjectURL(file);
      addSourceFromUrl(localUrl, file);
    }
  }, [addSourceFromUrl]);

  // ── Character model management ──
  const addCharacterFromUrl = useCallback((url: string, file: File | null) => {
    setCharacterImages((prev) => {
      if (prev.some((s) => s.url === url)) return prev;
      return [...prev, { id: crypto.randomUUID(), url, file }];
    });
  }, []);

  const removeCharacter = useCallback((id: string) => {
    setCharacterImages((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleCharacterFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      const localUrl = URL.createObjectURL(file);
      addCharacterFromUrl(localUrl, file);
    }
    if (characterInputRef.current) characterInputRef.current.value = "";
  }, [addCharacterFromUrl]);

  const handleCharacterDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setCharacterDropOver(false);
    const historyData = e.dataTransfer.getData("application/x-history-item");
    const droppedUrl = e.dataTransfer.getData("text/plain");
    if (historyData || (droppedUrl && droppedUrl.startsWith("http"))) {
      const url = historyData ? JSON.parse(historyData).resultUrl : droppedUrl;
      // Remote URL — store directly, no need to download (uploadForReference will pass it through)
      addCharacterFromUrl(url, null);
      return;
    }
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      addCharacterFromUrl(URL.createObjectURL(file), file);
    }
  }, [addCharacterFromUrl]);

  // ── Outfit management ──
  const addOutfitFromUrl = useCallback((url: string, file: File | null) => {
    setOutfitImages((prev) => {
      if (prev.some((s) => s.url === url)) return prev;
      return [...prev, { id: crypto.randomUUID(), url, file }];
    });
  }, []);

  const removeOutfit = useCallback((id: string) => {
    setOutfitImages((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleOutfitFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      addOutfitFromUrl(URL.createObjectURL(file), file);
    }
    if (outfitInputRef.current) outfitInputRef.current.value = "";
  }, [addOutfitFromUrl]);

  const handleOutfitDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setOutfitDropOver(false);
    const historyData = e.dataTransfer.getData("application/x-history-item");
    const droppedUrl = e.dataTransfer.getData("text/plain");
    if (historyData || (droppedUrl && droppedUrl.startsWith("http"))) {
      const url = historyData ? JSON.parse(historyData).resultUrl : droppedUrl;
      addOutfitFromUrl(url, null);
      return;
    }
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      addOutfitFromUrl(URL.createObjectURL(file), file);
    }
  }, [addOutfitFromUrl]);

  // Convert any image source to a PNG File using canvas (handles HEIC, WebP, etc.)
  const convertToPng = async (src: string): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image() as HTMLImageElement;
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Failed to convert image"));
            resolve(new File([blob], "image.png", { type: "image/png" }));
          },
          "image/png"
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = src;
    });
  };

  // Upload a source file to get a hosted URL
  const uploadForReference = async (src: SourceImage): Promise<string | null> => {
    const isRemote = src.url.startsWith("http://") || src.url.startsWith("https://");

    // For remote URLs, still convert to PNG to ensure Kie.ai compatibility
    // (remote URLs may point to HEIC, WebP, or other unsupported formats)
    let fileToUpload: File | null = null;

    if (isRemote) {
      // Check if URL already points to a supported image type
      const lowerUrl = src.url.toLowerCase().split("?")[0];
      if (lowerUrl.endsWith(".png") || lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg")) {
        return src.url;
      }
      // Try to convert unsupported formats (WebP, HEIC, etc.) to PNG
      try {
        fileToUpload = await convertToPng(src.url);
      } catch {
        // If conversion fails (CORS etc.), pass the URL through directly
        return src.url;
      }
    } else {
      // Handle blob URLs or local files
      fileToUpload = src.file ?? null;

      // If file is empty/dummy (e.g. from history drag), fetch the blob URL to get real data
      if (!fileToUpload || fileToUpload.size === 0) {
        if (src.url.startsWith("blob:")) {
          try {
            fileToUpload = await convertToPng(src.url);
          } catch {
            return null;
          }
        } else {
          return null;
        }
      } else {
        // Convert local file to PNG if it's not already PNG/JPG
        const type = fileToUpload.type;
        if (type !== "image/png" && type !== "image/jpeg") {
          try {
            const blobUrl = URL.createObjectURL(fileToUpload);
            fileToUpload = await convertToPng(blobUrl);
            URL.revokeObjectURL(blobUrl);
          } catch {
            // Keep original file if conversion fails
          }
        }
      }
    }

    if (!fileToUpload) return null;

    const formData = new FormData();
    formData.append("file", fileToUpload);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      return data.url || null;
    } catch {
      return null;
    }
  };

  // Analyze jewelry via OpenAI vision to get detailed description for video prompts
  const analyzeJewelryForVideo = async (imageUrl: string): Promise<string> => {
    try {
      const res = await fetch("/api/analyze-jewelry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });
      const analysis = await res.json();
      if (analysis.error) {
        logUsage?.("analyze-jewelry", { status: "error", detail: analysis.error });
        return "";
      }
      logUsage?.("analyze-jewelry", { status: "success" });
      const { type, description } = analysis;
      return `The jewelry is a ${type || "piece"}: ${description || "luxury jewelry piece"}. `;
    } catch {
      return "";
    }
  };

  const VIDEO_CONSISTENCY_PREFIX =
    "ABSOLUTE STRICT RULE FOR VIDEO: The jewelry product shown in the video MUST be an EXACT, IDENTICAL match to the original product. " +
    "Every detail must be preserved — the exact shape, design, number and placement of gemstones, metal color and finish, proportions, engravings, settings, and overall craftsmanship. " +
    "Do NOT substitute, redesign, simplify, or alter the jewelry in ANY way. The product must look like the SAME physical object filmed in real life. " +
    "The jewelry is the undisputed hero and centerpiece of every frame. ";

  // 4 shot types for consistent model generation
  // Default outfit description when user doesn't provide one
  const DEFAULT_OUTFIT =
    "a trendy East Asian Gen-Z inspired outfit — bold, fashion-forward streetwear-meets-luxury style. " +
    "Think oversized structured blazer over a cropped top, or a sleek leather jacket with high-waisted wide-leg pants, " +
    "or a minimalist asymmetric designer top with statement accessories. The vibe is confident, edgy, and effortlessly cool — " +
    "inspired by Seoul and Tokyo street fashion with a high-fashion twist.";

  // Resolve outfit description: user-provided > default
  // Convert cm dimension + jewelry type into body-relative scale language
  const getSizePrompt = (type: string, bodyPlacement: string): string => {
    if (!jewelryDimension.trim()) return "";
    const raw = jewelryDimension.trim().toLowerCase();
    // Parse the largest number from input like "2×3", "1.5", "2x3cm"
    const nums = raw.match(/[\d.]+/g)?.map(Number).filter(n => !isNaN(n));
    if (!nums || nums.length === 0) return "";
    const maxCm = Math.max(...nums);
    const minCm = Math.min(...nums);

    // Body-relative comparisons keyed by jewelry type
    const tLower = type.toLowerCase();
    let sizeDesc = "";

    if (tLower.includes("ring")) {
      if (maxCm <= 1) sizeDesc = "a thin, delicate band — barely wider than the finger it sits on";
      else if (maxCm <= 2) sizeDesc = "a normal-sized ring — proportional to the finger, not oversized";
      else sizeDesc = "a statement ring — slightly larger than typical but still proportional to the hand";
    } else if (tLower.includes("earring")) {
      if (maxCm <= 1.5) sizeDesc = "tiny stud earrings — smaller than the earlobe, sitting flush against the ear";
      else if (maxCm <= 3) sizeDesc = "small drop earrings — roughly the length of the earlobe";
      else if (maxCm <= 5) sizeDesc = "medium earrings — extending slightly below the earlobe";
      else sizeDesc = "long dangling earrings — reaching toward the jawline but NOT touching the shoulder";
    } else if (tLower.includes("necklace") || tLower.includes("pendant")) {
      if (maxCm <= 1.5) sizeDesc = "a tiny, delicate pendant — about the size of a fingernail";
      else if (maxCm <= 3) sizeDesc = "a small pendant — roughly thumbnail-sized, sitting against the collarbone area";
      else if (maxCm <= 5) sizeDesc = "a medium pendant — about the width of two fingers side by side";
      else sizeDesc = "a larger pendant — but still much smaller than the palm of a hand";
    } else if (tLower.includes("bracelet") || tLower.includes("bangle")) {
      if (minCm <= 0.5) sizeDesc = "a thin, delicate chain bracelet — a fine line around the wrist";
      else if (minCm <= 1) sizeDesc = "a slim bracelet — about the width of a pencil, fitting snugly on the wrist";
      else sizeDesc = "a medium-width bracelet — but NOT a cuff, still proportional to the wrist";
    } else if (tLower.includes("brooch") || tLower.includes("pin")) {
      if (maxCm <= 2) sizeDesc = "a small brooch — about the size of a coin, pinned on fabric";
      else if (maxCm <= 4) sizeDesc = "a medium brooch — roughly the size of two coins side by side";
      else sizeDesc = "a larger brooch — but still fits within the palm of a hand";
    } else {
      // Generic fallback
      if (maxCm <= 1) sizeDesc = "a very tiny, delicate piece — smaller than a fingertip";
      else if (maxCm <= 3) sizeDesc = "a small piece — roughly thumbnail-sized";
      else if (maxCm <= 5) sizeDesc = "a medium-sized piece — about the width of two fingers";
      else sizeDesc = "a moderately sized piece — but still proportional to the body, NOT oversized";
    }

    return (
      `CRITICAL SIZE RULE: The jewelry is ${sizeDesc} (${raw} cm). ` +
      "Do NOT enlarge or exaggerate the jewelry. It must appear at REALISTIC proportions relative to the model's body. " +
      "If anything, err on the side of making it slightly SMALLER rather than bigger. " +
      "The jewelry should look like a real photograph — real jewelry is always small relative to the human body. "
    );
  };

  const getOutfitPrompt = () => {
    if (outfitDescription.trim()) return outfitDescription.trim();
    if (outfitImages.length > 0) return "the EXACT outfit shown in the outfit reference images";
    return DEFAULT_OUTFIT;
  };

  const buildShotPrompts = () => {
    const outfit = getOutfitPrompt();
    const outfitRule = outfitImages.length > 0
      ? `OUTFIT RULE: The model MUST wear the EXACT outfit shown in the outfit reference images. Reproduce every detail of the clothing — fabric, color, cut, fit, style, and accessories. ${outfitDescription.trim() ? `The outfit is: ${outfitDescription.trim()}. ` : ""}`
      : `OUTFIT RULE: The model must wear ${outfit}. `;

    return [
      {
        id: "closeup-front",
        label: "Close-Up Front",
        scenePrompt:
          "SHOT TYPE: Close-up shot from the FRONT angle, tightly framed on the jewelry piece and the body area where it is worn. " +
          "The model faces the camera directly. Her face is partially visible (jawline, neck, décolletage, ear, or hand depending on jewelry type) to confirm character identity. " +
          outfitRule +
          "Macro-level detail — every facet of the gemstones, metal finish, and craftsmanship is razor-sharp and in perfect focus. " +
          "Lighting: soft, refined studio lighting with a strong key light that makes the jewelry sparkle brilliantly. Shallow depth of field with creamy bokeh. " +
          "Background: clean, softly blurred neutral studio backdrop. " +
          "Shot on Hasselblad H6D-100c, 120mm Macro, f/2.8, ISO 64.",
      },
      {
        id: "closeup-side",
        label: "Close-Up Side",
        scenePrompt:
          "SHOT TYPE: Close-up shot from a 45-degree SIDE angle, giving a three-quarter perspective on the jewelry. " +
          "Tightly framed on the jewelry piece and surrounding body area. The model's side profile or three-quarter face is partially visible to confirm character identity. " +
          outfitRule +
          "This angle reveals different facets, depth, and dimensionality of the jewelry that the front close-up does not show. " +
          "Lighting: dramatic directional side lighting that sculpts the jewelry's form and creates dynamic highlights and shadows across the gemstones and metal. " +
          "Background: clean, softly blurred neutral backdrop. " +
          "Shot on Hasselblad H6D-100c, 100mm Macro, f/3.2, ISO 64. Shallow depth of field.",
      },
      {
        id: "closeup-above",
        label: "Close-Up Above",
        scenePrompt:
          "SHOT TYPE: Close-up shot from a slightly ELEVATED angle (about 30 degrees above), looking down at the jewelry on the model. " +
          "This bird's-eye-adjacent perspective showcases the top surface of the jewelry — the crown of gemstones, the setting from above, the symmetry of the design. " +
          "The model's head, shoulders, or hand are partially visible from above to maintain character identity. " +
          outfitRule +
          "Lighting: overhead key light with soft fill creating beautiful top-down highlights on every surface of the jewelry. " +
          "Background: softly blurred, clean neutral tones. " +
          "Shot on Hasselblad H6D-100c, 90mm Macro, f/2.8, ISO 64. Extremely shallow depth of field.",
      },
      {
        id: "lifestyle",
        label: "Daily Life",
        scenePrompt:
          "SHOT TYPE: Lifestyle / daily life candid editorial shot, medium to full body. " +
          outfitRule +
          "She is in a beautiful real-world setting — a sunlit café terrace, a modern art gallery, an elegant city street, or a stylish rooftop. " +
          "The mood is candid, aspirational, and effortlessly cool — she's living her stylish daily life while wearing the jewelry. " +
          "Her full outfit is clearly visible in this wider shot. " +
          "Natural lighting mixed with ambient light. Shot on Sony A1, 50mm f/1.4, ISO 200. " +
          "Warm, lifestyle editorial color grading. The jewelry is visible and catches natural light beautifully. " +
          "This shot shows the jewelry is wearable and stunning in everyday life, not just in a studio.",
      },
    ];
  };

  // Cache jewelry analysis to avoid repeated API calls for 4 shots of same piece
  const jewelryAnalysisCache = useRef<Record<string, { type: string; description: string; body_placement: string }>>({});

  const analyzeJewelryCached = async (jewelryUrl: string) => {
    if (jewelryAnalysisCache.current[jewelryUrl]) return jewelryAnalysisCache.current[jewelryUrl];
    const res = await fetch("/api/analyze-jewelry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: jewelryUrl }),
    });
    const analysis = await res.json();
    const result = analysis.error
      ? { type: "jewelry piece", description: "luxury jewelry", body_placement: "elegantly" }
      : { type: analysis.type || "jewelry piece", description: analysis.description || "luxury jewelry", body_placement: analysis.body_placement || "elegantly" };
    logUsage?.("analyze-jewelry", { status: analysis.error ? "error" : "success" });
    jewelryAnalysisCache.current[jewelryUrl] = result;
    return result;
  };

  // Build consistent model prompt for a specific shot type
  const buildConsistentModelPrompt = async (
    jewelryUrl: string,
    numCharRefs: number,
    shotPrompt: string
  ): Promise<string> => {
    const { type, description, body_placement } = await analyzeJewelryCached(jewelryUrl);

    const hasOutfitRefs = outfitImages.length > 0;
    const outfitRefNote = hasOutfitRefs
      ? `OUTFIT REFERENCE: Some reference images show the outfit the model must wear. Reproduce this outfit EXACTLY — same fabric, color, cut, fit, and style. `
      : "";

    return (
      `ABSOLUTE RULE — CHARACTER IDENTITY: The first ${numCharRefs} reference image${numCharRefs > 1 ? "s" : ""} show the EXACT person who must appear in the generated image. ` +
      "You MUST reproduce this SPECIFIC person — her EXACT face, facial bone structure, eye shape, nose, lips, jawline, skin tone, hair color, hair style, hair texture, and body type. " +
      "This is NOT a generic model — she is a SPECIFIC real person and MUST be recognizable as the SAME individual across every generated image. " +
      "Copy her appearance from the reference photos as precisely as a portrait photographer would. " +
      "\n\n" +
      outfitRefNote +
      "JEWELRY RULE: The LAST reference image shows the exact jewelry product. " +
      `The jewelry is a ${type}: ${description}. ` +
      getSizePrompt(type, body_placement) +
      `It must be worn ${body_placement} and must be the EXACT same product — every gemstone, metal detail, and design element preserved perfectly. ` +
      "The jewelry is the hero of the shot, prominently visible and in sharp focus. " +
      "\n\n" +
      shotPrompt +
      "\n\n" +
      "The final result must look like one shot from a cohesive luxury campaign series — same person, same outfit style, across all images."
    );
  };

  // Build consistent wearing prompt: source image dictates the EXACT wearing style.
  // Unlike consistent-model, here the source image already shows the piece being
  // worn correctly, so we (a) analyze the piece for structured text grounding,
  // (b) put the wearing rule LAST so later instructions dominate, and
  // (c) explicitly decouple "camera angle" from "wearing placement" so the shot
  // prompt can't be misread as authorization to re-place the jewelry.
  const buildConsistentWearingPrompt = async (
    jewelryUrl: string,
    numCharRefs: number,
    shotPrompt: string
  ): Promise<string> => {
    const { type, description, body_placement } = await analyzeJewelryCached(jewelryUrl);

    const hasOutfitRefs = outfitImages.length > 0;
    const outfitRefNote = hasOutfitRefs
      ? `OUTFIT REFERENCE: Some reference images show the outfit the model must wear. Reproduce this outfit EXACTLY — same fabric, color, cut, fit, and style. `
      : "";

    return (
      `ABSOLUTE RULE — CHARACTER IDENTITY: The first ${numCharRefs} reference image${numCharRefs > 1 ? "s" : ""} show the EXACT person who must appear in the generated image. ` +
      "You MUST reproduce this SPECIFIC person — her EXACT face, facial bone structure, eye shape, nose, lips, jawline, skin tone, hair color, hair style, hair texture, and body type. " +
      "This is NOT a generic model — she is a SPECIFIC real person and MUST be recognizable as the SAME individual across every generated image. " +
      "Copy her appearance from the reference photos as precisely as a portrait photographer would. " +
      "\n\n" +
      outfitRefNote +
      "CAMERA & FRAMING — The following describes ONLY the camera angle, lens, lighting, and framing of this particular shot. It does NOT authorize you to change where or how the jewelry is worn, nor to re-style, re-place, flip, mirror, or re-angle the piece:\n" +
      shotPrompt +
      "\n\n" +
      "═══════════════════════════════════════════════════════════\n" +
      "ABSOLUTE RULE — JEWELRY IDENTITY & WEARING STYLE\n" +
      "(HIGHEST PRIORITY — overrides every other instruction above)\n" +
      "═══════════════════════════════════════════════════════════\n" +
      `The LAST reference image is the GROUND TRUTH: a ${type} — ${description} — already worn by a model in the EXACT correct way. In the source the piece is worn ${body_placement}. ` +
      getSizePrompt(type, body_placement) +
      "\n" +
      "(1) JEWELRY IDENTITY — The output MUST show the SAME physical piece, not a similar one. Preserve every gemstone (exact count, cut, color, clarity, arrangement, setting), every metal detail (color, finish, engravings, prongs, chains, links, clasps), every facet, every proportion, every imperfection. This is the SAME object, photographed again — zero creative liberty on the product itself.\n" +
      "(2) WEARING PLACEMENT — The jewelry must appear on the EXACT same body part, the EXACT same side (left vs right), and the EXACT same sub-position as the source reference. " +
      "If the source shows an earring on a specific ear and lobe position → same ear, same lobe position. " +
      "If the source shows a ring on a specific finger of a specific hand → same finger, same hand. " +
      "If the source shows a bracelet on a specific wrist at a specific position → same wrist, same position. " +
      "If the source shows a necklace at a specific drop length → same drop length on the same side of the collarbone / sternum. " +
      "If the source shows a brooch pinned at a specific angle on a specific side → same angle, same side. " +
      "If the source shows an anklet on a specific ankle → same ankle.\n" +
      "(3) WEARING ORIENTATION — The orientation of the piece relative to the body must be IDENTICAL: same up/down, same front/back, same rotation, same tilt. Do NOT flip, mirror, rotate, or re-angle the piece to suit the new camera.\n" +
      "(4) CONTACT & DRAPE — The way the piece interacts with skin, hair, and clothing must match the source: same tuck of hair behind/over the piece, same drape of chains, same resting line on the collarbone, same pressure and contact points against the skin or fabric.\n" +
      "(5) CAMERA vs. WEARING — ONLY the camera angle, framing, lens, and lighting may change between shots. The way the jewelry is worn must NOT change. When the camera moves to a new angle, we must see the SAME worn piece from that new angle — NEVER a re-styled, re-placed, or re-oriented version.\n" +
      "(6) NO REINTERPRETATION — Do NOT reinterpret, restyle, re-place, flip, mirror, re-angle, resize, 'improve', 'balance', or 'complete' the jewelry or its placement. Treat the LAST reference image as the immutable ground truth for BOTH the product and how it is worn.\n" +
      "\n" +
      "The jewelry is the hero of the shot — prominently visible, in razor-sharp focus, and IDENTICAL to the source reference in both product identity and wearing style. " +
      "The final result must look like one frame from a cohesive luxury campaign series: same person, same outfit, SAME exact jewelry worn in the SAME exact way — only the camera changes."
    );
  };

  const handleGenerate = async () => {
    if (!selectedTemplate || sourceImages.length === 0) return;

    const template = TEMPLATES.find((t) => t.id === selectedTemplate);
    if (!template) return;

    const isConsistentFlow = template.id === "consistent-model" || template.id === "consistent-wearing";

    // Validate consistent templates require character references
    if (isConsistentFlow && characterImages.length === 0) {
      setError(t("char.needRefs"));
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedImages([]);
    setGeneratedVideo(null);

    try {
      // Upload all source images and get hosted URLs
      const uploadedSources: { id: string; url: string }[] = [];
      for (const src of sourceImages) {
        const hostedUrl = await uploadForReference(src);
        if (hostedUrl) {
          uploadedSources.push({ id: src.id, url: hostedUrl });
        }
      }

      if (uploadedSources.length === 0) {
        throw new Error(t("mkt.noValidSources"));
      }

      // Upload character images if needed for consistent templates
      let characterUrls: string[] = [];
      if (isConsistentFlow) {
        for (const ch of characterImages) {
          const hostedUrl = await uploadForReference(ch);
          if (hostedUrl) characterUrls.push(hostedUrl);
        }
      }

      // Fire API calls for each source image
      const newTasks: TaskInfo[] = [];

      for (const src of uploadedSources) {
        // Build prompt per image
        let prompt: string;
        let imageRefs: string[];

        if (isConsistentFlow) {
          // Upload outfit images if any
          let outfitUrls: string[] = [];
          for (const ot of outfitImages) {
            const hostedUrl = await uploadForReference(ot);
            if (hostedUrl) outfitUrls.push(hostedUrl);
          }

          if (contentType === "video") {
            // ── Consistent model video: force image generation first ──
            // User must generate images first, then pick one as the base for video.
            // So when in video mode, we still generate images (4 shots).
            // The "Generate Video" button will appear on each result image.
          }

          // ── Image mode: fire 4 shots per jewelry piece ──
          // Build refs: character images + outfit images + jewelry image (up to 14)
          const jewelrySlots = 1;
          const outfitSlots = Math.min(outfitUrls.length, 3);
          const charSlots = 14 - jewelrySlots - outfitSlots;

          let charRefs = [...characterUrls];
          while (charRefs.length < charSlots && charRefs.length < characterUrls.length * 6) {
            charRefs = [...charRefs, ...characterUrls];
          }
          charRefs = charRefs.slice(0, charSlots);
          const numCharRefs = charRefs.length;

          const refs = [...charRefs, ...outfitUrls.slice(0, outfitSlots), src.url].slice(0, 14);

          // Build 4 shot prompts with outfit context
          const shots = buildShotPrompts();

          for (const shot of shots) {
            const shotPrompt = template.id === "consistent-wearing"
              ? await buildConsistentWearingPrompt(src.url, numCharRefs, shot.scenePrompt)
              : await buildConsistentModelPrompt(src.url, numCharRefs, shot.scenePrompt);

            const shotRes = await fetch("/api/kie", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "image",
                prompt: shotPrompt,
                aspect_ratio: shot.id.startsWith("closeup") ? "1:1" : aspectRatio,
                resolution: "2K",
                image_input: refs,
              }),
            });
            const shotData = await shotRes.json();

            if (shotData.error) {
              logUsage?.("image-generate", { status: "error", detail: shotData.error });
              setError((prev) => prev ? `${prev}\n${shot.label}: ${shotData.error}` : `${shot.label}: ${shotData.error}`);
              continue;
            }

            logUsage?.("image-generate", { status: "success", detail: shot.label });
            newTasks.push({
              sourceId: src.id,
              sourceUrl: src.url,
              taskId: shotData.taskId,
              status: "waiting",
              taskType: "image",
            });
          }
          continue; // Skip the single-task creation below
        } else if (contentType === "video") {
          const jewelryDesc = await analyzeJewelryForVideo(src.url);
          prompt = VIDEO_CONSISTENCY_PREFIX + jewelryDesc + template.prompt;
          imageRefs = [];
        } else {
          prompt = CONSISTENCY_PREFIX + template.prompt;
          imageRefs = [src.url];
        }

        const res = await fetch("/api/kie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: contentType === "video" ? "video" : "image",
            prompt,
            aspect_ratio: aspectRatio,
            resolution: "2K",
            video_model: videoModel,
            image_input: imageRefs.length > 0 ? imageRefs : undefined,
          }),
        });
        const data = await res.json();

        if (data.error) {
          logUsage?.(contentType === "video" ? "video-generate" : "image-generate", { status: "error", detail: data.error });
          setError((prev) => prev ? `${prev}\n${data.error}` : data.error);
          continue;
        }

        logUsage?.(contentType === "video" ? "video-generate" : "image-generate", { status: "success", detail: template.label });
        newTasks.push({
          sourceId: src.id,
          sourceUrl: src.url,
          taskId: data.taskId,
          status: "waiting",
          taskType: contentType === "video" ? "video" : "image",
        });
      }

      if (newTasks.length === 0) {
        throw new Error(t("mkt.failedToStart"));
      }

      setActiveTasks(newTasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start generation");
      setLoading(false);
    }
  };

  // ── Generate video from a selected generated image (consistent-model workflow) ──
  const handleGenerateVideoFromImage = async (baseImageUrl: string) => {
    if (!selectedTemplate || selectedTemplate !== "consistent-model") return;
    if (sourceImages.length === 0) return;

    setVideoFromImageLoading(true);
    setVideoBaseImage(baseImageUrl);
    setError(null);
    setGeneratedVideo(null);

    try {
      // Use the first source image (jewelry) for analysis
      const jewelrySrc = sourceImages[0];
      const hostedJewelryUrl = await uploadForReference(jewelrySrc);
      if (!hostedJewelryUrl) throw new Error("Failed to upload jewelry image");

      // Analyze jewelry type for a brief prompt mention
      const { type: jType, body_placement: jPlace } =
        await analyzeJewelryCached(hostedJewelryUrl);

      // Keep prompt concise — Kling has a text length limit.
      // The reference image already shows the person, outfit, and jewelry.
      const videoPrompt =
        "Animate this reference image into a cinematic luxury jewelry campaign video. " +
        "The model slowly turns to showcase the jewelry from multiple angles. " +
        `She is wearing a ${jType} ${jPlace}. ` +
        (jewelryDimension ? `The jewelry is small — ${jewelryDimension} cm, keep realistic scale. ` : "") +
        "Preserve her exact face, outfit, and jewelry throughout. " +
        "Smooth elegant motion, studio lighting, shallow depth of field, luxurious mood.";

      const videoRes = await fetch("/api/kie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "video",
          prompt: videoPrompt,
          aspect_ratio: aspectRatio,
          video_model: videoModel,
          reference_image: baseImageUrl,
        }),
      });
      const videoData = await videoRes.json();

      if (videoData.error) {
        logUsage?.("video-generate", { status: "error", detail: videoData.error });
        setError(videoData.error);
        setVideoFromImageLoading(false);
        return;
      }

      logUsage?.("video-generate", { status: "success", detail: "Video from image" });

      // Poll for video result
      const taskId = videoData.taskId;
      const pollVideo = setInterval(async () => {
        try {
          const pollRes = await fetch(
            `/api/kie?taskId=${taskId}&type=video`
          );
          const pollData = await pollRes.json();

          if (pollData.status === "success") {
            clearInterval(pollVideo);
            const videoUrl =
              pollData.videos?.[0]?.url || pollData.videos?.[0];
            if (videoUrl) {
              setGeneratedVideo({ url: videoUrl });
              onAddHistory({
                id: `vid-${Date.now()}`,
                sourceUrl: baseImageUrl,
                resultUrl: videoUrl,
                mode: "video",
                settings: { rotate: 0, forward: 0, vertical: 0, wide: false, prompt: "Consistent model video" },
                timestamp: Date.now(),
              });
            }
            setVideoFromImageLoading(false);
            setVideoBaseImage(null);
          } else if (pollData.status === "fail") {
            clearInterval(pollVideo);
            setError(pollData.error || "Video generation failed");
            setVideoFromImageLoading(false);
            setVideoBaseImage(null);
          }
        } catch {
          clearInterval(pollVideo);
          setError("Failed to poll video status");
          setVideoFromImageLoading(false);
          setVideoBaseImage(null);
        }
      }, 5000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start video generation"
      );
      setVideoFromImageLoading(false);
      setVideoBaseImage(null);
    }
  };

  const canGenerate = !!selectedTemplate && sourceImages.length > 0 && !loading;
  const isConsistentModel = selectedTemplate === "consistent-model" || selectedTemplate === "consistent-wearing";
  const isConsistentModelVideo = isConsistentModel && contentType === "video";
  const ratios = contentType === "video" ? VIDEO_RATIOS : IMAGE_RATIOS;
  const completedCount = generatedImages.length;
  const totalCount = generatedImages.length + activeTasks.length;

  return (
    <div className="space-y-5">
      {/* Content Type Toggle */}
      <div className="flex items-center gap-2">
        {(
          [
            { key: "image" as const, icon: Image, labelKey: "mkt.staticImage" as const },
            { key: "video" as const, icon: Video, labelKey: "mkt.video" as const },
          ]
        ).map(({ key, icon: Icon, labelKey }) => (
          <button
            key={key}
            onClick={() => {
              setContentType(key);
              setAspectRatio(key === "video" ? "16:9" : "4:3");
              setGeneratedImages([]);
              setGeneratedVideo(null);
              setError(null);
            }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all border ${
              contentType === key
                ? "bg-foreground text-background border-foreground shadow-sm"
                : "bg-card text-muted border-border hover:border-foreground/20 hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Other page generation banner */}
      {otherPageLoading && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-card border border-border shadow-sm animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin text-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {otherPageMode === "3d" ? "3D" : otherPageMode === "inpaint" ? t("mode.edit") : t("mode.camera")} {t("mkt.contentGenerating")}
            </p>
            <p className="text-xs text-muted">{t("mkt.inProgress")}</p>
          </div>
          <button
            onClick={() => onSwitchMode(otherPageMode as "camera" | "inpaint" | "3d")}
            className="shrink-0 px-3 py-1.5 rounded-full bg-foreground text-background text-xs font-medium hover:bg-primary-hover transition-all"
          >
            {t("mkt.view")}
          </button>
        </div>
      )}

      {/* ── Source Images + Generated Result side by side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* Left: Source Images (multi) */}
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t("mkt.sourceImages")}
          </h2>
          <p className="text-[10px] text-muted/60">
            {t("mkt.sourceHint")}
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <div
            className={`flex-1 min-h-[320px] rounded-2xl border-2 transition-all ${
              sourceDropOver
                ? "border-primary border-dashed bg-primary/5"
                : sourceImages.length === 0
                  ? "border-dashed border-border"
                  : "border-border border-solid"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setSourceDropOver(true);
            }}
            onDragLeave={() => setSourceDropOver(false)}
            onDrop={handleSourceDrop}
          >
            {sourceImages.length === 0 ? (
              /* Empty state */
              <div
                className="flex flex-col items-center justify-center h-full p-8 cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="p-5 rounded-full bg-card border border-border shadow-sm">
                  <Upload className="w-6 h-6 text-muted" />
                </div>
                <p className="text-sm font-medium text-foreground mt-5">
                  {t("mkt.dropHere")}
                </p>
                <p className="text-xs text-muted mt-1.5">
                  {t("mkt.multiFormat")}
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="mt-4 px-5 py-2 rounded-full bg-foreground text-background text-sm font-medium hover:bg-primary-hover transition-all shadow-sm"
                >
                  {t("upload.browse")}
                </button>
              </div>
            ) : (
              /* Grid of source images */
              <div className="p-3">
                <div className={`grid gap-2 ${
                  sourceImages.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"
                }`}>
                  {sourceImages.map((src) => (
                    <div
                      key={src.id}
                      className="group relative rounded-xl overflow-hidden border border-border bg-card aspect-square"
                    >
                      <img
                        src={src.url}
                        alt="Source"
                        className="w-full h-full object-cover"
                        crossOrigin="anonymous"
                      />
                      {!loading && (
                        <button
                          onClick={() => removeSource(src.id)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-full bg-white/90 hover:bg-danger hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {/* Add more button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border hover:border-foreground/20 hover:bg-card/50 transition-all aspect-square"
                  >
                    <Plus className="w-5 h-5 text-muted" />
                    <span className="text-[10px] text-muted mt-1">{t("mkt.addMore")}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Generated Result */}
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {isConsistentModelVideo
              ? t("mkt.pickForVideo")
              : contentType === "video"
                ? t("mkt.generatedVideo")
                : t("mkt.generatedImages")}
          </h2>
          {isConsistentModelVideo && !loading && generatedImages.length > 0 && !videoFromImageLoading ? (
            <p className="text-[10px] text-primary font-medium">
              {t("mkt.clickVideo")}
            </p>
          ) : (
            <div className="h-[18px]" />
          )}

          {error && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700 whitespace-pre-line">
              {error}
            </div>
          )}

          {/* Loading state with progress */}
          {loading && (
            <div className="flex-1 flex flex-col rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              {/* Already-completed images show at top */}
              {generatedImages.length > 0 && (
                <div className={`grid gap-2 p-3 ${
                  generatedImages.length === 1 ? "grid-cols-1" : "grid-cols-2"
                }`}>
                  {generatedImages.map((img, i) => (
                    <div
                      key={i}
                      className="group relative rounded-xl overflow-hidden border border-border bg-card cursor-pointer"
                      onClick={() => setMaximizedImage(img.url)}
                    >
                      <img
                        src={img.url}
                        alt={`Generated ${i + 1}`}
                        className="w-full h-auto object-contain"
                        crossOrigin="anonymous"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-2 right-2">
                          <Maximize2 className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Placeholder slots for remaining tasks */}
                  {activeTasks.map((task) => (
                    <div
                      key={task.taskId}
                      className="flex flex-col items-center justify-center rounded-xl border border-border bg-card/50 aspect-square"
                    >
                      <Loader2 className="w-5 h-5 animate-spin text-muted" />
                      <p className="text-[10px] text-muted mt-2">
                        {task.status === "generating" ? t("mkt.generatingDots") : t("mkt.queued")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {/* Progress bar when no images yet */}
              {generatedImages.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-foreground" />
                  <p className="text-sm font-medium mt-5">
                    {t("mkt.generatingCount")} {totalCount} {totalCount !== 1 ? t("mkt.images") : t("mkt.image")}...
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {completedCount} {t("mkt.of")} {totalCount} {t("mkt.completed")}
                  </p>
                  <div className="w-48 h-1.5 rounded-full bg-border mt-4 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-foreground/70 transition-all duration-500"
                      style={{ width: totalCount > 0 ? `${Math.max(5, (completedCount / totalCount) * 100)}%` : "5%" }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Generated images (done) */}
          {!loading && generatedImages.length > 0 && (
            <div className="flex-1 flex flex-col gap-3">
              <div className={`grid gap-3 ${
                generatedImages.length === 1 ? "grid-cols-1" : "grid-cols-2"
              }`}>
                {generatedImages.map((img, i) => (
                  <div
                    key={i}
                    className={`group relative rounded-2xl overflow-hidden border bg-card shadow-sm ${
                      videoBaseImage === img.url
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border"
                    } ${isConsistentModel ? "" : "cursor-pointer"}`}
                    onClick={() => {
                      if (!isConsistentModel) setMaximizedImage(img.url);
                    }}
                  >
                    <img
                      src={img.url}
                      alt={`Generated ${i + 1}`}
                      className={`w-full h-auto object-contain transition-opacity ${
                        videoFromImageLoading && videoBaseImage === img.url ? "opacity-50" : ""
                      }`}
                      crossOrigin="anonymous"
                    />
                    {/* Loading overlay when this image is being used for video */}
                    {videoFromImageLoading && videoBaseImage === img.url && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
                        <Loader2 className="w-8 h-8 animate-spin text-white" />
                        <p className="text-xs text-white font-medium mt-2">
                          {t("mkt.generatingVideo")}
                        </p>
                      </div>
                    )}
                    {/* Always-visible "Generate Video" button for consistent-model + video */}
                    {isConsistentModel && !videoFromImageLoading && (
                      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent z-20">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleGenerateVideoFromImage(img.url);
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-white text-foreground text-xs font-semibold hover:bg-primary hover:text-white transition-all shadow-md flex items-center justify-center gap-1.5"
                          title="Generate video from this image"
                        >
                          <Play className="w-3.5 h-3.5" />
                          {t("mkt.generateVideoFromThis")}
                        </button>
                      </div>
                    )}
                    {/* Hover overlay with maximize/download */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                      <div className="absolute top-3 right-3 flex gap-2 pointer-events-auto">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMaximizedImage(img.url);
                          }}
                          className="p-2 rounded-full bg-white/90 hover:bg-white transition-all shadow-sm"
                          title="Maximize"
                        >
                          <Maximize2 className="w-3.5 h-3.5 text-foreground" />
                        </button>
                        <a
                          href={img.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 rounded-full bg-white/90 hover:bg-white transition-all shadow-sm"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5 text-foreground" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate || videoFromImageLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-card border border-border text-sm font-medium hover:bg-card-hover transition-all disabled:opacity-30"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t("mkt.regenerateImages")}
              </button>
            </div>
          )}

          {/* Generated video */}
          {!loading && generatedVideo && (
            <div className="flex-1 flex flex-col gap-3">
              <div className="rounded-2xl overflow-hidden border border-border bg-card shadow-sm">
                <video
                  src={generatedVideo.url}
                  controls
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full"
                  crossOrigin="anonymous"
                />
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <Play className="w-3 h-3" />
                    {aspectRatio} · Kling
                  </div>
                  <a
                    href={generatedVideo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-foreground hover:text-primary-hover transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    {t("result.download")}
                  </a>
                </div>
              </div>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-card border border-border text-sm font-medium hover:bg-card-hover transition-all disabled:opacity-30"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t("mkt.regenerate")}
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && generatedImages.length === 0 && !generatedVideo && !error && (
            <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-8">
              <div className="p-4 rounded-full bg-card border border-border">
                {contentType === "video" ? (
                  <Video className="w-6 h-6 text-muted/30" />
                ) : (
                  <Image className="w-6 h-6 text-muted/30" />
                )}
              </div>
              <p className="text-sm text-muted mt-4">
                {isConsistentModelVideo
                  ? t("mkt.emptyPickFirst")
                  : contentType === "video"
                    ? t("mkt.emptyGenVideo")
                    : t("mkt.emptyGenImages")}
              </p>
              <p className="text-xs text-muted/60 mt-1">
                {isConsistentModelVideo
                  ? t("mkt.emptyStep")
                  : t("mkt.emptyTheme")}
              </p>
            </div>
          )}

          {/* Aspect ratio + Generate inline */}
          <div className="flex items-end gap-3 mt-auto pt-2">
            <div className="shrink-0">
              <label className="text-[11px] font-medium text-foreground/70 mb-1 block">
                {t("mkt.aspectRatio")}
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="px-3 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 transition-all appearance-none"
              >
                {ratios.map((ar) => (
                  <option key={ar.value} value={ar.value}>
                    {ar.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="shrink-0">
              <label className="text-[11px] font-medium text-foreground/70 mb-1 block">
                {t("mkt.pieceSize")}
              </label>
              <input
                type="text"
                value={jewelryDimension}
                onChange={(e) => setJewelryDimension(e.target.value)}
                placeholder="e.g. 2×3"
                className="w-24 px-3 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 transition-all placeholder:text-muted/40"
              />
            </div>
            {contentType === "video" && (
              <div className="shrink-0">
                <label className="text-[11px] font-medium text-foreground/70 mb-1 block">
                  {t("mkt.videoModel")}
                </label>
                <select
                  value={videoModel}
                  onChange={(e) => setVideoModel(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 transition-all appearance-none"
                >
                  <option value="kling-2.6">{t("videoModel.best")}</option>
                  <option value="kling-3.0">{t("videoModel.latest")}</option>
                  <option value="kling-2.5-turbo">{t("videoModel.fast")}</option>
                </select>
              </div>
            )}
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-foreground text-background font-medium text-sm hover:bg-primary-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("mkt.generatingCount")} {completedCount}/{totalCount}...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {isConsistentModelVideo
                    ? `${t("mkt.generateImagesFirst")}${sourceImages.length > 1 ? ` (${sourceImages.length})` : ""}`
                    : `${contentType === "video" ? t("mkt.generateVideo") : t("mkt.generateImages")}${sourceImages.length > 1 ? ` (${sourceImages.length})` : ""}`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Character Model Reference ── */}
      {(selectedTemplate === "consistent-model" || selectedTemplate === "consistent-wearing" || characterImages.length > 0) && (
        <div className="rounded-2xl border border-border bg-card/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t("char.title")}
              </h2>
              <p className="text-[10px] text-muted/60 mt-0.5">
                {t("char.hint")}
              </p>
            </div>
            <button
              onClick={() => characterInputRef.current?.click()}
              disabled={loading}
              className="px-3 py-1.5 rounded-full bg-foreground text-background text-xs font-medium hover:bg-primary-hover transition-all disabled:opacity-30"
            >
              <Upload className="w-3 h-3 inline mr-1 -mt-0.5" />
              {t("char.uploadPhotos")}
            </button>
          </div>

          <input
            ref={characterInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleCharacterFileSelect}
            className="hidden"
          />

          <div
            className={`rounded-xl border-2 transition-all min-h-[80px] ${
              characterDropOver
                ? "border-primary border-dashed bg-primary/5"
                : characterImages.length === 0
                  ? "border-dashed border-border"
                  : "border-border border-solid"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setCharacterDropOver(true);
            }}
            onDragLeave={() => setCharacterDropOver(false)}
            onDrop={handleCharacterDrop}
          >
            {characterImages.length === 0 ? (
              <div className="flex items-center justify-center p-4 gap-2 text-xs text-muted">
                <Plus className="w-3.5 h-3.5" />
                {t("char.dropHere")}
              </div>
            ) : (
              <div className="p-2">
                <div className="flex gap-2 flex-wrap">
                  {characterImages.map((ch) => (
                    <div
                      key={ch.id}
                      className="group relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-card"
                    >
                      <img
                        src={ch.url}
                        alt="Character"
                        className="w-full h-full object-cover"
                        crossOrigin="anonymous"
                      />
                      <button
                        onClick={() => removeCharacter(ch.id)}
                        className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-white/90 hover:bg-danger hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => characterInputRef.current?.click()}
                    className="w-20 h-20 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-foreground/20 transition-all"
                  >
                    <Plus className="w-4 h-4 text-muted" />
                    <span className="text-[9px] text-muted mt-0.5">{t("char.add")}</span>
                  </button>
                </div>
                <p className="text-[10px] text-muted/50 mt-2">
                  {characterImages.length} {characterImages.length !== 1 ? t("char.refCount") : t("char.refCountSingle")}
                </p>
              </div>
            )}
          </div>

          {/* Outfit Reference */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {t("outfit.title")}
                </h3>
                <p className="text-[10px] text-muted/60 mt-0.5">
                  {t("outfit.hint")}
                </p>
              </div>
              <button
                onClick={() => outfitInputRef.current?.click()}
                disabled={loading}
                className="px-3 py-1.5 rounded-full bg-card border border-border text-xs font-medium hover:bg-card-hover transition-all disabled:opacity-30"
              >
                <Upload className="w-3 h-3 inline mr-1 -mt-0.5" />
                {t("outfit.upload")}
              </button>
            </div>

            <input
              ref={outfitInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleOutfitFileSelect}
              className="hidden"
            />

            {/* Outfit images */}
            {outfitImages.length > 0 && (
              <div
                className={`rounded-xl border-2 transition-all mb-2 ${
                  outfitDropOver ? "border-primary border-dashed bg-primary/5" : "border-border border-solid"
                }`}
                onDragOver={(e) => { e.preventDefault(); setOutfitDropOver(true); }}
                onDragLeave={() => setOutfitDropOver(false)}
                onDrop={handleOutfitDrop}
              >
                <div className="p-2">
                  <div className="flex gap-2 flex-wrap">
                    {outfitImages.map((ot) => (
                      <div
                        key={ot.id}
                        className="group relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-card"
                      >
                        <img src={ot.url} alt="Outfit" className="w-full h-full object-cover" crossOrigin="anonymous" />
                        <button
                          onClick={() => removeOutfit(ot.id)}
                          className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-white/90 hover:bg-danger hover:text-white transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => outfitInputRef.current?.click()}
                      className="w-20 h-20 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-foreground/20 transition-all"
                    >
                      <Plus className="w-4 h-4 text-muted" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {outfitImages.length === 0 && (
              <div
                className={`rounded-xl border-2 transition-all min-h-[48px] flex items-center justify-center mb-2 ${
                  outfitDropOver ? "border-primary border-dashed bg-primary/5" : "border-dashed border-border"
                }`}
                onDragOver={(e) => { e.preventDefault(); setOutfitDropOver(true); }}
                onDragLeave={() => setOutfitDropOver(false)}
                onDrop={handleOutfitDrop}
              >
                <div className="flex items-center gap-2 p-3 text-xs text-muted">
                  <Plus className="w-3.5 h-3.5" />
                  {t("outfit.dropHere")}
                </div>
              </div>
            )}

            {/* Outfit text description */}
            <input
              type="text"
              value={outfitDescription}
              onChange={(e) => setOutfitDescription(e.target.value)}
              placeholder={t("outfit.placeholder")}
              className="w-full px-3 py-2 rounded-xl bg-card border border-border text-xs focus:outline-none focus:border-foreground/30 focus:ring-1 focus:ring-foreground/10 transition-all placeholder:text-muted/40"
            />
            {!outfitDescription.trim() && outfitImages.length === 0 && (
              <p className="text-[9px] text-muted/40 mt-1 italic">
                {t("outfit.default")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Studio Themes ── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
          {t("mkt.studioTheme")}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {TEMPLATES.map((tmpl) => (
            <TemplatePreview key={tmpl.id} template={tmpl}>
              <button
                onClick={() => setSelectedTemplate(tmpl.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all border ${
                  selectedTemplate === tmpl.id
                    ? "bg-foreground text-background border-foreground shadow-sm"
                    : "bg-card text-foreground/80 border-border hover:border-foreground/20 hover:bg-card-hover"
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm">{tmpl.icon}</span>
                  <span className="text-[12px] font-semibold leading-tight">{t(`tmpl.${tmpl.id}` as TKey)}</span>
                </div>
                <p className={`text-[10px] leading-snug ${
                  selectedTemplate === tmpl.id ? "text-background/70" : "text-muted/60"
                }`}>
                  {t(`desc.${tmpl.id}` as TKey)}
                </p>
              </button>
            </TemplatePreview>
          ))}
        </div>
      </div>

      {/* Generation History */}
      {history.length > 0 && (
        <div className="mt-6" id="marketing-history">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t("history.title")}
              </h3>
              <span className="text-xs text-muted/60">({history.length})</span>
            </div>
          </div>
          <p className="text-[10px] text-muted/50 mb-2">
            {t("mkt.clickMaximize")}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {history.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/x-history-item",
                      JSON.stringify({ resultUrl: item.resultUrl })
                    );
                    e.dataTransfer.setData("text/plain", item.resultUrl);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => {
                    if (item.resultUrl) {
                      setMaximizedImage(item.resultUrl);
                    }
                  }}
                  className="group relative aspect-square rounded-lg overflow-hidden border-2 border-border hover:border-foreground/20 cursor-pointer transition-all"
                >
                  {item.resultUrl ? (
                    <img
                      src={item.resultUrl}
                      alt="History"
                      className="w-full h-full object-cover pointer-events-none"
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-card flex items-center justify-center">
                      <Image className="w-4 h-4 text-muted/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 className="w-4 h-4 text-white" />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Fullscreen Lightbox */}
      {maximizedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setMaximizedImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={maximizedImage}
              alt="Full size"
              className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl"
              crossOrigin="anonymous"
            />
            <div className="absolute top-3 right-3 flex gap-2">
              <a
                href={maximizedImage}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 rounded-full bg-white/90 hover:bg-white transition-all shadow-md"
                title="Download"
              >
                <Download className="w-4 h-4 text-foreground" />
              </a>
              <button
                onClick={() => setMaximizedImage(null)}
                className="p-2.5 rounded-full bg-white/90 hover:bg-white transition-all shadow-md"
                title="Close"
              >
                <X className="w-4 h-4 text-foreground" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
