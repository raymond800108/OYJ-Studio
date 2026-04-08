"use client";

import { useState, useRef, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";

// Generate a consistent gradient based on template id
function getGradient(id: string): string {
  const gradients: Record<string, string> = {
    "glass-display": "linear-gradient(135deg, #e8e8e8 0%, #f8f8f8 30%, #d0d0d0 100%)",
    "natural-surface": "linear-gradient(135deg, #b8a07a 0%, #d4c4a8 50%, #e8dcc8 100%)",
    "dark-dramatic": "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #2a2a2a 100%)",
    "creative-floating": "linear-gradient(135deg, #f0e6ff 0%, #e6f0ff 50%, #f0f0ff 100%)",
    "clean-neutral": "linear-gradient(135deg, #f5f5f5 0%, #e8e6e3 50%, #faf9f7 100%)",
    "elemental-artistic": "linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)",
    "detail-closeup": "linear-gradient(135deg, #2d2d2d 0%, #4a4a4a 50%, #2d2d2d 100%)",
    "packaging-box": "linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 50%, #4a2c6e 100%)",
    "natural-branches": "linear-gradient(135deg, #2d4a2d 0%, #4a6b3a 50%, #8fbc8f 100%)",
    "vintage-heritage": "linear-gradient(135deg, #8b7355 0%, #c4a882 50%, #dbc9a8 100%)",
    "moss-rock": "linear-gradient(135deg, #3a5a3a 0%, #6b8e6b 50%, #c8d8c8 100%)",
    "high-end-model": "linear-gradient(135deg, #1a1a1a 0%, #333333 50%, #4a4a4a 100%)",
    "consistent-model": "linear-gradient(135deg, #2a2a3a 0%, #3a3a5a 50%, #4a4a6a 100%)",
    "clean-white-studio": "linear-gradient(135deg, #ffffff 0%, #f5f5f5 50%, #ffffff 100%)",
    "ugc-model": "linear-gradient(135deg, #ffecd2 0%, #fcb69f 50%, #ff9a9e 100%)",
  };
  return gradients[id] || "linear-gradient(135deg, #e8e6e3 0%, #d4d1cd 50%, #c0bdb8 100%)";
}

function extractTags(description: string): string[] {
  const keywords = [
    "white", "neutral", "dark", "dramatic", "natural", "organic", "vintage",
    "editorial", "macro", "luxury", "studio", "lifestyle", "minimal",
    "artistic", "floating", "cozy", "model", "texture", "detail", "close-up",
    "clean", "warm", "golden", "glass", "marble", "moss", "rock", "branch",
    "heritage", "elegant", "UGC", "packaging",
  ];
  const lower = description.toLowerCase();
  return keywords.filter((k) => lower.includes(k.toLowerCase())).slice(0, 4);
}

function isDark(id: string): boolean {
  return [
    "elemental-artistic", "detail-closeup", "dark-dramatic", "high-end-model",
    "consistent-model", "packaging-box",
  ].includes(id);
}

interface Props {
  template: { id: string; label: string; icon: string; description: string; dynamic?: boolean };
  children: React.ReactNode;
}

export default function TemplatePreview({ template, children }: Props) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<"top" | "bottom">("top");
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleEnter = () => {
    timeoutRef.current = setTimeout(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Show above if near bottom of screen, below if near top
        setPos(rect.top > 320 ? "top" : "bottom");
      }
      setShow(true);
    }, 250);
  };

  const handleLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const gradient = getGradient(template.id);
  const dark = isDark(template.id);
  const tags = extractTags(template.description);

  // Check for real preview image
  const previewSrc = `/templates/${template.id}.jpg`;
  const [imgError, setImgError] = useState(false);
  const hasRealImage = !imgError;

  useEffect(() => { setImgError(false); }, [template.id]);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}

      {show && (
        <div
          className={`absolute z-50 w-64 rounded-2xl overflow-hidden border border-border shadow-2xl ${
            pos === "top" ? "bottom-full mb-2 left-1/2 -translate-x-1/2" : "top-full mt-2 left-1/2 -translate-x-1/2"
          }`}
        >
          {/* Visual preview */}
          {hasRealImage ? (
            <div className="relative h-40 overflow-hidden">
              <img
                src={previewSrc}
                alt={`${template.label} preview`}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
              {template.dynamic && (
                <span className="absolute top-2 right-2 text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full bg-black/50 text-white backdrop-blur-sm">
                  {t("preview.aiPowered")}
                </span>
              )}
            </div>
          ) : (
            <div
              className="relative h-32 flex items-center justify-center overflow-hidden"
              style={{ background: gradient }}
            >
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-3 left-3 w-12 h-12 rounded-full bg-white/20 blur-xl" />
                <div className="absolute bottom-3 right-3 w-14 h-10 rounded-lg bg-black/10 blur-lg" />
              </div>

              <div className="relative flex flex-col items-center gap-1.5">
                <span className="text-4xl drop-shadow-lg">{template.icon}</span>
                {template.dynamic && (
                  <span
                    className={`text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                      dark ? "bg-white/20 text-white" : "bg-black/10 text-foreground/60"
                    }`}
                  >
                    {t("preview.aiPowered")}
                  </span>
                )}
              </div>

              <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse" />
            </div>
          )}

          {/* Info */}
          <div className="bg-card p-3">
            <h4 className="font-semibold text-xs mb-1">{t(`tmpl.${template.id}` as TKey)}</h4>
            <p className="text-[11px] text-muted leading-relaxed mb-2">
              {t(`desc.${template.id}` as TKey)}
            </p>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[9px] px-1.5 py-0.5 rounded-full bg-background border border-border text-muted font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
