"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, ImageIcon, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface ImageUploaderProps {
  imageUrl: string | null;
  onImageUpload: (url: string, file: File) => void;
  onClear: () => void;
  disabled?: boolean;
}

export default function ImageUploader({
  imageUrl,
  onImageUpload,
  onClear,
  disabled,
}: ImageUploaderProps) {
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setUploading(true);

      // Create a local preview immediately
      const localUrl = URL.createObjectURL(file);
      onImageUpload(localUrl, file);
      setUploading(false);
    },
    [onImageUpload]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);

      // Check if this is a history item drop (image URL from history panel)
      const historyData = e.dataTransfer.getData("application/x-history-item");
      const droppedUrl = e.dataTransfer.getData("text/plain");

      if (historyData || (droppedUrl && droppedUrl.startsWith("http"))) {
        // Fetch the remote image and create a File from it
        try {
          setUploading(true);
          const url = historyData
            ? JSON.parse(historyData).resultUrl
            : droppedUrl;
          const res = await fetch(url);
          const blob = await res.blob();
          const ext = blob.type.split("/")[1] || "png";
          const file = new File([blob], `history-image.${ext}`, {
            type: blob.type,
          });
          onImageUpload(url, file);
        } catch {
          // If fetch fails (CORS), use the URL directly with a dummy file
          const url = historyData
            ? JSON.parse(historyData).resultUrl
            : droppedUrl;
          const dummyFile = new File([""], "history-image.png", {
            type: "image/png",
          });
          onImageUpload(url, dummyFile);
        } finally {
          setUploading(false);
        }
        return;
      }

      // Normal file drop
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile, onImageUpload]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const [dropOver, setDropOver] = useState(false);

  if (imageUrl) {
    return (
      <div
        className={`relative group rounded-2xl overflow-hidden border-2 bg-card shadow-sm transition-all ${
          dropOver
            ? "border-primary border-dashed bg-primary/5"
            : "border-border border-solid"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDropOver(true);
        }}
        onDragLeave={() => setDropOver(false)}
        onDrop={(e) => {
          setDropOver(false);
          onDrop(e);
        }}
      >
        <img
          src={imageUrl}
          alt="Uploaded product"
          className={`w-full h-full object-contain max-h-[500px] transition-opacity ${
            dropOver ? "opacity-30" : ""
          }`}
        />
        {dropOver && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-primary" />
              <p className="text-sm font-medium text-primary">
                {t("upload.replaceSource")}
              </p>
            </div>
          </div>
        )}
        {!disabled && !dropOver && (
          <button
            onClick={onClear}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-white/90 backdrop-blur-sm border border-border hover:bg-danger hover:text-white hover:border-danger transition-all opacity-0 group-hover:opacity-100 shadow-sm"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {!dropOver && (
          <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-sm border border-border text-xs text-muted shadow-sm">
            <ImageIcon className="w-3 h-3 inline mr-1.5 -mt-0.5" />
            {t("upload.source")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`drop-zone relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 cursor-pointer min-h-[320px] ${
        dragging
          ? "dragging border-primary bg-primary/5"
          : "border-border hover:border-border-hover hover:bg-card/50"
      } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        className="hidden"
      />
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="p-5 rounded-full bg-card border border-border shadow-sm">
          <Upload className="w-6 h-6 text-muted" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {uploading ? t("upload.uploading") : t("upload.drop")}
          </p>
          <p className="text-xs text-muted mt-1.5">
            {t("upload.format")}
          </p>
        </div>
        <button
          type="button"
          className="px-5 py-2 rounded-full bg-foreground text-background text-sm font-medium hover:bg-primary-hover transition-all shadow-sm"
        >
          {t("upload.browse")}
        </button>
      </div>
    </div>
  );
}
