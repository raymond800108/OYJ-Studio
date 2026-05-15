"use client";

import { useRef, useState } from "react";
import { useI18n, TKey } from "@/lib/i18n";

const W = 560;
const H = 400;
const CX = W / 2;
const CY = H / 2 + 30;
const ORBIT_RX = 200;
const ORBIT_RY = 60;
const DOME_HEIGHT = 160;

const TEAL = "#06b6d4";
const PINK = "#ec4899";
const AMBER = "#f59e0b";
const GHOST = "#d4d1cd";

export interface OrbitParams {
  horizontalAngle: number; // 0..360
  verticalAngle: number;   // -30..90
  zoom: number;            // 0..10
}

interface OrbitCameraControlProps {
  value: OrbitParams;
  onChange: (next: OrbitParams) => void;
  productImageUrl?: string | null;
  disabled?: boolean;
}

type DragTarget = "azimuth" | "elevation" | "zoom" | null;

const HORIZONTAL_LABEL_KEYS: TKey[] = [
  "orbit.label.front",
  "orbit.label.frontRight",
  "orbit.label.right",
  "orbit.label.backRight",
  "orbit.label.back",
  "orbit.label.backLeft",
  "orbit.label.left",
  "orbit.label.frontLeft",
];

function horizontalLabelKey(deg: number): TKey {
  const bucket = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return HORIZONTAL_LABEL_KEYS[bucket];
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export default function OrbitCameraControl({
  value,
  onChange,
  productImageUrl,
  disabled,
}: OrbitCameraControlProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const { t } = useI18n();

  const { horizontalAngle, verticalAngle, zoom } = value;

  // Projection: camera handle 2D position
  const azRad = (horizontalAngle / 180) * Math.PI;
  const azX = Math.sin(azRad);
  const azZ = Math.cos(azRad);
  const elRad = (verticalAngle / 180) * Math.PI;
  const elScale = Math.cos(elRad);
  const cameraX = CX + azX * ORBIT_RX * elScale;
  const cameraY = CY - azZ * ORBIT_RY * elScale - Math.sin(elRad) * DOME_HEIGHT;

  // Product center & zoom handle (along sight line)
  const productX = CX;
  const productY = CY;
  const zoomT = clamp(zoom / 10, 0, 1);
  const zoomHandleX = productX + (cameraX - productX) * (0.25 + 0.7 * zoomT);
  const zoomHandleY = productY + (cameraY - productY) * (0.25 + 0.7 * zoomT);

  function getSvgCoords(e: React.PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  function onPointerDown(target: DragTarget) {
    return (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      setDragging(target);
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || disabled) return;
    const c = getSvgCoords(e);
    if (!c) return;

    if (dragging === "azimuth") {
      const dx = c.x - CX;
      const dy = CY - c.y;
      const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
      const normalized = ((deg % 360) + 360) % 360;
      onChange({ ...value, horizontalAngle: Math.round(normalized) });
    } else if (dragging === "elevation") {
      const dy = CY - c.y;
      const ratio = clamp(dy / (ORBIT_RY + DOME_HEIGHT), -0.4, 1);
      let v = Math.round(ratio * 100);
      v = clamp(v, -30, 90);
      onChange({ ...value, verticalAngle: v });
    } else if (dragging === "zoom") {
      const dxC = cameraX - productX;
      const dyC = cameraY - productY;
      const lineLen = Math.hypot(dxC, dyC) || 1;
      const dxP = c.x - productX;
      const dyP = c.y - productY;
      const projection = (dxP * dxC + dyP * dyC) / (lineLen * lineLen);
      const z = clamp(((projection - 0.25) / 0.7) * 10, 0, 10);
      onChange({ ...value, zoom: Math.round(z * 10) / 10 });
    }
  }

  function onPointerUp() {
    setDragging(null);
  }

  return (
    <div className="select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ touchAction: "none" }}
      >
        {/* Dome (top half of ellipse) */}
        <path
          d={`M ${CX - ORBIT_RX} ${CY} A ${ORBIT_RX} ${DOME_HEIGHT} 0 0 1 ${CX + ORBIT_RX} ${CY}`}
          fill="none"
          stroke={GHOST}
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
        {/* Orbit ellipse (ground) */}
        <ellipse
          cx={CX}
          cy={CY}
          rx={ORBIT_RX}
          ry={ORBIT_RY}
          fill="none"
          stroke={GHOST}
          strokeWidth={1.5}
        />
        {/* Ground line */}
        <line x1={CX - ORBIT_RX} y1={CY} x2={CX + ORBIT_RX} y2={CY} stroke={GHOST} strokeWidth={1} opacity={0.4} />

        {/* Product image at center */}
        <g transform={`translate(${productX - 40}, ${productY - 40})`}>
          {productImageUrl ? (
            <image
              href={productImageUrl}
              width={80}
              height={80}
              preserveAspectRatio="xMidYMid slice"
              clipPath="url(#productClip)"
            />
          ) : (
            <rect width={80} height={80} rx={6} fill="#f5f5f5" stroke={GHOST} strokeWidth={1} />
          )}
          <defs>
            <clipPath id="productClip">
              <rect width={80} height={80} rx={6} />
            </clipPath>
          </defs>
        </g>

        {/* Camera-to-product sight line */}
        <line
          x1={productX}
          y1={productY}
          x2={cameraX}
          y2={cameraY}
          stroke={AMBER}
          strokeWidth={1.5}
          opacity={0.5}
          strokeDasharray="3 3"
        />

        {/* Azimuth handle (teal) */}
        <circle
          cx={cameraX}
          cy={cameraY}
          r={12}
          fill={TEAL}
          stroke="white"
          strokeWidth={2}
          style={{ cursor: disabled ? "not-allowed" : "grab" }}
          onPointerDown={onPointerDown("azimuth")}
        />

        {/* Elevation handle (pink) — small dot above camera */}
        <circle
          cx={cameraX}
          cy={cameraY - 22}
          r={7}
          fill={PINK}
          stroke="white"
          strokeWidth={1.5}
          style={{ cursor: disabled ? "not-allowed" : "ns-resize" }}
          onPointerDown={onPointerDown("elevation")}
        />

        {/* Zoom handle (amber) */}
        <circle
          cx={zoomHandleX}
          cy={zoomHandleY}
          r={7}
          fill={AMBER}
          stroke="white"
          strokeWidth={1.5}
          style={{ cursor: disabled ? "not-allowed" : "grab" }}
          onPointerDown={onPointerDown("zoom")}
        />
      </svg>

      <div className="flex items-center justify-center gap-4 mt-2 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: TEAL }} />
          {t("orbit.legend.horizontal")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: PINK }} />
          {t("orbit.legend.vertical")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: AMBER }} />
          {t("orbit.legend.zoom")}
        </span>
      </div>

      <p className="text-center text-[11px] text-foreground mt-1 font-mono tabular-nums">
        {horizontalAngle}° {t(horizontalLabelKey(horizontalAngle))} ·{" "}
        {verticalAngle >= 0 ? `+${verticalAngle}` : verticalAngle}° ·{" "}
        {zoom.toFixed(1)}× {t("orbit.legend.zoom").toLowerCase()}
      </p>
    </div>
  );
}
