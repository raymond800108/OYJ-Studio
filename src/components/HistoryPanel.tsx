"use client";

import { useState } from "react";
import { Clock, Trash2, Box, Camera, Video } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export interface HistoryItem {
  id: string;
  sourceUrl: string;
  resultUrl: string;
  mode?: "camera" | "inpaint" | "3d" | "video";
  settings: {
    rotate: number;
    forward: number;
    vertical: number;
    wide: boolean;
    prompt: string;
  };
  timestamp: number;
}

interface HistoryPanelProps {
  items: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onClear: () => void;
}

function HistoryThumbnail({
  src,
  mode,
}: {
  src: string;
  mode?: string;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className="w-full aspect-square bg-card flex flex-col items-center justify-center gap-1.5">
        {mode === "3d" ? (
          <Box className="w-5 h-5 text-muted" />
        ) : mode === "video" ? (
          <Video className="w-5 h-5 text-muted" />
        ) : (
          <Camera className="w-5 h-5 text-muted" />
        )}
        <span className="text-[9px] text-muted font-medium">
          {mode === "3d" ? t("history.3dModel") : mode === "video" ? t("history.video") : t("history.generated")}
        </span>
      </div>
    );
  }

  if (mode === "video") {
    return (
      <div className="relative w-full aspect-square bg-black flex items-center justify-center">
        <video
          src={src}
          className="w-full h-full object-cover"
          muted
          playsInline
          onError={() => setFailed(true)}
          crossOrigin="anonymous"
          onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
          onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
        />
        <div className="absolute top-1.5 right-1.5 bg-black/60 rounded px-1.5 py-0.5">
          <Video className="w-3 h-3 text-white" />
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="Generated"
      className="w-full aspect-square object-cover"
      onError={() => setFailed(true)}
      crossOrigin="anonymous"
      referrerPolicy="no-referrer"
    />
  );
}

export default function HistoryPanel({
  items,
  onSelect,
  onClear,
}: HistoryPanelProps) {
  const { t } = useI18n();

  if (items.length === 0) return null;

  const handleDragStart = (e: React.DragEvent, item: HistoryItem) => {
    // Set the result image URL as transferable data
    e.dataTransfer.setData("text/plain", item.resultUrl);
    e.dataTransfer.setData("application/x-history-item", JSON.stringify(item));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t("history.title")}
          </h3>
          <span className="text-xs text-muted/60">({items.length})</span>
        </div>
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-muted hover:text-danger transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          {t("history.clear")}
        </button>
      </div>
      <p className="text-[10px] text-muted/50 mb-2">
        {t("history.dragHint")}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            draggable
            onDragStart={(e) => handleDragStart(e, item)}
            onClick={() => onSelect(item)}
            className="group relative rounded-xl overflow-hidden border border-border hover:border-foreground/30 transition-all shadow-sm bg-card cursor-grab active:cursor-grabbing"
          >
            <HistoryThumbnail src={item.resultUrl} mode={item.mode} />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-2 left-2 right-2">
                <p className="text-[10px] text-foreground/80 truncate">
                  {item.mode === "3d"
                    ? t("history.3dModel")
                    : item.mode === "video"
                    ? t("history.video")
                    : `${item.settings.rotate}° · fwd ${item.settings.forward} · vert ${item.settings.vertical}`}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
