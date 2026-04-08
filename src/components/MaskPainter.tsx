"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { Stage, Layer, Image as KonvaImage, Line } from "react-konva";
import {
  Paintbrush,
  Eraser,
  RotateCcw,
  Download,
  Minus,
  Plus,
} from "lucide-react";

interface MaskPainterProps {
  imageUrl: string;
  onMaskReady: (maskDataUrl: string) => void;
  width?: number;
  height?: number;
  disabled?: boolean;
}

interface DrawLine {
  tool: "brush" | "eraser";
  points: number[];
  strokeWidth: number;
}

export default function MaskPainter({
  imageUrl,
  onMaskReady,
  disabled,
}: MaskPainterProps) {
  const stageRef = useRef<ReturnType<typeof Stage> | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [lines, setLines] = useState<DrawLine[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [brushSize, setBrushSize] = useState(30);
  const [stageSize, setStageSize] = useState({ width: 512, height: 512 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Load image
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImage(img);
      // Fit image to container
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const scale = containerWidth / img.width;
        const scaledHeight = img.height * scale;
        setStageSize({
          width: containerWidth,
          height: Math.min(scaledHeight, 600),
        });
      }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const handleMouseDown = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      if (disabled) return;
      setIsDrawing(true);
      const stage = e.target.getStage();
      const pos = stage?.getPointerPosition();
      if (!pos) return;
      setLines((prev) => [
        ...prev,
        { tool, points: [pos.x, pos.y], strokeWidth: brushSize },
      ]);
    },
    [disabled, tool, brushSize]
  );

  const handleMouseMove = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      if (!isDrawing || disabled) return;
      const stage = e.target.getStage();
      const pos = stage?.getPointerPosition();
      if (!pos) return;
      setLines((prev) => {
        const lastLine = prev[prev.length - 1];
        if (!lastLine) return prev;
        const updated = {
          ...lastLine,
          points: [...lastLine.points, pos.x, pos.y],
        };
        return [...prev.slice(0, -1), updated];
      });
    },
    [isDrawing, disabled]
  );

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  // Export mask as white-on-black PNG
  const exportMask = useCallback(() => {
    if (!image || lines.length === 0) return null;

    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Black background = preserve
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Scale factor from stage to original image
    const scaleX = image.width / stageSize.width;
    const scaleY = image.height / stageSize.height;

    // Draw white lines = replace
    ctx.strokeStyle = "white";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const line of lines) {
      if (line.tool === "eraser") continue; // Skip eraser lines in mask

      ctx.lineWidth = line.strokeWidth * scaleX;
      ctx.beginPath();
      for (let i = 0; i < line.points.length; i += 2) {
        const x = line.points[i] * scaleX;
        const y = line.points[i + 1] * scaleY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Handle eraser: draw black over white
    ctx.strokeStyle = "black";
    for (const line of lines) {
      if (line.tool !== "eraser") continue;
      ctx.lineWidth = line.strokeWidth * scaleX;
      ctx.beginPath();
      for (let i = 0; i < line.points.length; i += 2) {
        const x = line.points[i] * scaleX;
        const y = line.points[i + 1] * scaleY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    return canvas.toDataURL("image/png");
  }, [image, lines, stageSize]);

  // Notify parent when mask changes
  useEffect(() => {
    const mask = exportMask();
    if (mask) onMaskReady(mask);
  }, [lines, exportMask, onMaskReady]);

  const handleClear = () => {
    setLines([]);
  };

  const handleUndo = () => {
    setLines((prev) => prev.slice(0, -1));
  };

  const { t } = useI18n();
  const hasMask = lines.length > 0;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center bg-card border border-border rounded-full p-0.5 gap-0.5">
          <button
            onClick={() => setTool("brush")}
            disabled={disabled}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              tool === "brush"
                ? "bg-foreground text-background shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Paintbrush className="w-3.5 h-3.5" />
            {t("mask.paint")}
          </button>
          <button
            onClick={() => setTool("eraser")}
            disabled={disabled}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              tool === "eraser"
                ? "bg-foreground text-background shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
            {t("mask.erase")}
          </button>
        </div>

        {/* Brush size */}
        <div className="flex items-center gap-1.5 bg-card border border-border rounded-full px-3 py-1">
          <button
            onClick={() => setBrushSize(Math.max(5, brushSize - 5))}
            className="text-muted hover:text-foreground p-0.5"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-xs font-mono text-muted w-6 text-center">
            {brushSize}
          </span>
          <button
            onClick={() => setBrushSize(Math.min(100, brushSize + 5))}
            className="text-muted hover:text-foreground p-0.5"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleUndo}
            disabled={!hasMask || disabled}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted hover:text-foreground disabled:opacity-30 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            {t("mask.undo")}
          </button>
          <button
            onClick={handleClear}
            disabled={!hasMask || disabled}
            className="px-2 py-1.5 rounded-lg text-xs text-muted hover:text-danger disabled:opacity-30 transition-colors"
          >
            {t("mask.clear")}
          </button>
        </div>

        {hasMask && (
          <span className="text-[10px] text-success ml-auto">
            {t("mask.regionSelected")}
          </span>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden border border-border bg-card"
        style={{ cursor: disabled ? "default" : "crosshair" }}
      >
        <Stage
          ref={stageRef as React.RefObject<never>}
          width={stageSize.width}
          height={stageSize.height}
          onMouseDown={handleMouseDown}
          onMousemove={handleMouseMove}
          onMouseup={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
          style={{ touchAction: "none" }}
        >
          <Layer>
            {image && (
              <KonvaImage
                image={image}
                width={stageSize.width}
                height={stageSize.height}
              />
            )}
          </Layer>
          <Layer>
            {lines.map((line, i) => (
              <Line
                key={i}
                points={line.points}
                stroke={line.tool === "brush" ? "rgba(167,139,250,0.5)" : "rgba(0,0,0,0.5)"}
                strokeWidth={line.strokeWidth}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={
                  line.tool === "eraser" ? "destination-out" : "source-over"
                }
              />
            ))}
          </Layer>
        </Stage>

        {/* Brush cursor preview */}
        {!disabled && (
          <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-background/70 backdrop-blur-sm text-[10px] text-muted">
            {tool === "brush" ? t("mask.paintArea") : t("mask.eraseArea")}
          </div>
        )}
      </div>
    </div>
  );
}
