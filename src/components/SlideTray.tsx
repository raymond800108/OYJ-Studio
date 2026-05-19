"use client";

import { useState, type RefObject } from "react";
import { Loader2, Upload, Play, GripVertical } from "lucide-react";
import { useI18n, type TKey } from "@/lib/i18n";

interface MinimalPost {
  mediaUrl: string;
  mediaType: "image" | "video";
  carouselUrls?: string[];
  carouselTypes?: ("image" | "video")[];
}

interface OrderedSlide {
  url: string;
  kind: "image" | "video";
}

interface SlideTrayProps {
  post: MinimalPost;
  /** Receives the reordered, full slide list (slide 1..N) with kinds. */
  onReorder: (nextSlides: OrderedSlide[]) => void;
  onReplaceClick: () => void;
  uploadingMedia: boolean;
  replaceInputRef: RefObject<HTMLInputElement | null>;
  onReplaceFile: (file: File) => void;
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm)(\?|$)/i;

function sniffKind(url: string): "image" | "video" {
  return VIDEO_EXT.test(url) ? "video" : "image";
}

/**
 * Draggable horizontal slide tray for the schedule edit modal.
 *
 * Renders mediaUrl + every carouselUrls entry as a square tile. Tiles are
 * HTML5-draggable; dropping one onto another reorders the array, calling
 * onReorder with the new full list. The first slot is highlighted as
 * "primary" because that's the cover slide IG renders in the feed.
 *
 * Videos can't reliably show a first-frame preview at thumbnail size
 * (fal CDN doesn't always serve range-requests for tiny <video> tiles),
 * so we layer a ▶ play badge so the user knows there's content there
 * and can click through if they want.
 */
export default function SlideTray({
  post,
  onReorder,
  onReplaceClick,
  uploadingMedia,
  replaceInputRef,
  onReplaceFile,
}: SlideTrayProps) {
  const { t } = useI18n();
  // Build the full slide list with per-slide kinds (so reorder + rendering
  // both know which tiles are videos even after the user swaps things).
  const slides: OrderedSlide[] = [
    { url: post.mediaUrl, kind: post.mediaType },
    ...(post.carouselUrls ?? []).map((url, i) => ({
      url,
      kind: (post.carouselTypes?.[i] ?? sniffKind(url)) as "image" | "video",
    })),
  ];
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function handleDrop(toIdx: number) {
    if (dragFrom === null || dragFrom === toIdx) {
      setDragFrom(null);
      setDragOver(null);
      return;
    }
    const next = [...slides];
    const [moved] = next.splice(dragFrom, 1);
    next.splice(toIdx, 0, moved);
    setDragFrom(null);
    setDragOver(null);
    onReorder(next);
  }

  return (
    <div className="flex-1 min-w-0 space-y-2">
      <div className="flex flex-wrap gap-2">
        {slides.map((slide, idx) => {
          const { url, kind } = slide;
          const isPrimary = idx === 0;
          const isVideo = kind === "video";
          const isDragging = dragFrom === idx;
          const isHoverTarget = dragOver === idx && dragFrom !== null && dragFrom !== idx;
          return (
            <div
              key={`${idx}-${url}`}
              draggable={slides.length > 1}
              onDragStart={() => setDragFrom(idx)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(idx);
              }}
              onDragLeave={() => setDragOver((prev) => (prev === idx ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(idx);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              className={`relative w-24 h-24 rounded-xl overflow-hidden border-2 transition-all group ${
                isHoverTarget
                  ? "border-foreground"
                  : isPrimary
                    ? "border-foreground/60"
                    : "border-border"
              } ${isDragging ? "opacity-40" : ""} ${
                slides.length > 1 ? "cursor-move" : ""
              }`}
              title={
                isPrimary
                  ? t("slideTray.tileTitlePrimary" as TKey)
                  : t("slideTray.tileTitleOther" as TKey).replace("{n}", String(idx + 1))
              }
            >
              {isVideo ? (
                <>
                  <video
                    src={url}
                    className="w-full h-full object-cover bg-black"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="w-7 h-7 rounded-full bg-white/85 text-foreground flex items-center justify-center shadow">
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </span>
                  </div>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="w-full h-full object-cover bg-card" />
              )}

              {/* Slide index badge */}
              <span className="absolute top-1 left-1 text-[10px] font-mono bg-black/70 text-white px-1.5 py-0.5 rounded">
                {idx + 1}
              </span>

              {/* Drag handle hint (multi-slide only) */}
              {slides.length > 1 && (
                <span className="absolute bottom-1 right-1 bg-black/60 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <GripVertical className="w-3 h-3" />
                </span>
              )}

              {/* Replace overlay — only on the primary tile (replaces slide 1) */}
              {isPrimary && (
                <>
                  <button
                    type="button"
                    onClick={onReplaceClick}
                    disabled={uploadingMedia}
                    title={t("slideTray.replace" as TKey)}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                  >
                    {uploadingMedia ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <Upload className="w-5 h-5 text-white" />
                    )}
                  </button>
                  <input
                    ref={replaceInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onReplaceFile(f);
                    }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      {slides.length > 1 && (
        <p className="text-[10px] text-muted">
          {t("slideTray.hint" as TKey).replace("{n}", String(slides.length))}
        </p>
      )}
    </div>
  );
}
