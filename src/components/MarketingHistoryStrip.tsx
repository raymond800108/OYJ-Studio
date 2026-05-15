"use client";

import { useState } from "react";
import { Clock, Trash2, Video as VideoIcon, Box as BoxIcon, Sun, Camera, Paintbrush } from "lucide-react";
import {
  useMarketingHistory,
  selectFromHistory,
  clearHistory,
} from "@/lib/marketing-history";
import { useI18n } from "@/lib/i18n";
import type { HistoryItem } from "@/components/HistoryPanel";

const MODE_ICONS: Record<NonNullable<HistoryItem["mode"]>, React.ComponentType<{ className?: string }>> = {
  camera: Camera,
  inpaint: Paintbrush,
  "3d": BoxIcon,
  video: VideoIcon,
  lighting: Sun,
};

export default function MarketingHistoryStrip() {
  const items = useMarketingHistory();
  const { t } = useI18n();
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  if (items.length === 0) {
    return (
      <div className="border-t border-border bg-card/50 py-4">
        <div className="max-w-6xl mx-auto px-6 flex items-center gap-2 text-xs text-muted">
          <Clock className="w-3.5 h-3.5" />
          <span>{t("history.title")}</span>
          <span className="opacity-60">— {t("history.dragHint")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-card/50 py-3">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{t("history.title")}</span>
            <span className="text-muted font-normal">({items.length})</span>
          </div>
          {showConfirmClear ? (
            <div className="flex items-center gap-2 text-[11px]">
              <button
                onClick={() => {
                  clearHistory();
                  setShowConfirmClear(false);
                }}
                className="px-2 py-0.5 rounded bg-red-500 text-white"
              >
                {t("history.clear")}
              </button>
              <button
                onClick={() => setShowConfirmClear(false)}
                className="text-muted hover:text-foreground"
              >
                {t("invoice.cancel")}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirmClear(true)}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
            >
              <Trash2 className="w-3 h-3" />
              {t("history.clear")}
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {items.map((item) => {
            const isVideo = item.mode === "video";
            const Icon = item.mode ? MODE_ICONS[item.mode] : Clock;
            return (
              <button
                key={item.id}
                onClick={() => selectFromHistory(item.resultUrl, item.mode)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/uri-list", item.resultUrl);
                  e.dataTransfer.setData("text/plain", item.resultUrl);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                title={item.settings?.prompt || item.mode}
                className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border bg-background hover:border-foreground/40 transition-colors cursor-pointer"
              >
                {isVideo ? (
                  <video
                    src={item.resultUrl}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.resultUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute top-1 left-1 p-0.5 rounded bg-black/60">
                  <Icon className="w-2.5 h-2.5 text-white" />
                </div>
                {isVideo && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
                    <VideoIcon className="w-5 h-5 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
