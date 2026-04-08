"use client";

import { Download, Loader2, ImageOff, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface ResultPanelProps {
  resultUrl: string | null;
  loading: boolean;
  error: string | null;
}

export default function ResultPanel({
  resultUrl,
  loading,
  error,
}: ResultPanelProps) {
  const { t } = useI18n();
  const handleDownload = async () => {
    if (!resultUrl) return;
    const response = await fetch(resultUrl);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `content-engine-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="generating flex flex-col items-center justify-center rounded-2xl border border-border bg-card min-h-[320px] p-8 shadow-sm">
        <div className="relative">
          <Loader2 className="w-8 h-8 text-foreground animate-spin" />
          <Sparkles className="w-3.5 h-3.5 text-accent absolute -top-1 -right-1 animate-pulse" />
        </div>
        <p className="text-sm font-medium mt-5 text-foreground">
          {t("result.generating")}
        </p>
        <p className="text-xs text-muted mt-1">
          {t("result.aiInference")}
        </p>
        <div className="flex gap-1.5 mt-5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-pulse"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-danger/20 bg-card min-h-[320px] p-8 shadow-sm">
        <ImageOff className="w-8 h-8 text-danger/50" />
        <p className="text-sm font-medium mt-4 text-danger">
          {t("result.failed")}
        </p>
        <p className="text-xs text-muted mt-1 text-center max-w-[280px]">
          {error}
        </p>
      </div>
    );
  }

  if (resultUrl) {
    return (
      <div className="relative group rounded-2xl overflow-hidden border border-border bg-card shadow-sm">
        <img
          src={resultUrl}
          alt="Generated result"
          className="w-full h-full object-contain max-h-[500px]"
        />
        <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 backdrop-blur-sm border border-border text-sm font-medium hover:bg-white transition-all shadow-sm"
          >
            <Download className="w-4 h-4" />
            {t("result.download")}
          </button>
        </div>
        <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-full bg-foreground/90 text-xs text-background font-medium shadow-sm">
          <Sparkles className="w-3 h-3 inline mr-1.5 -mt-0.5" />
          {t("result.generated")}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 min-h-[320px] p-8">
      <div className="p-4 rounded-full bg-card border border-border">
        <Sparkles className="w-6 h-6 text-muted/30" />
      </div>
      <p className="text-sm text-muted mt-4">{t("result.willAppear")}</p>
      <p className="text-xs text-muted/60 mt-1">
        {t("result.uploadAdjust")}
      </p>
    </div>
  );
}
