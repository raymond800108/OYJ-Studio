"use client";

import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

interface CameraOrbitProps {
  horizontalAngle: number;   // 0-360°
  verticalAngle: number;     // -30 to 90°
  zoom: number;              // 0-10
  sourceImageUrl: string | null;
  onRotateChange: (v: number) => void;
  onMoveForwardChange: (v: number) => void;
  onVerticalAngleChange: (v: number) => void;
  disabled?: boolean;
}

type DragTarget = "azimuth" | "elevation" | "distance" | null;

const COLOR = {
  azimuth: "#06b6d4",
  elevation: "#ec4899",
  distance: "#f59e0b",
} as const;

export default function CameraOrbit({
  horizontalAngle,
  verticalAngle,
  zoom,
  sourceImageUrl,
  onRotateChange,
  onMoveForwardChange,
  onVerticalAngleChange,
  disabled,
}: CameraOrbitProps) {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const [hovered, setHovered] = useState<DragTarget>(null);

  const W = 560;
  const H = 400;
  const CX = W / 2;
  const CY = H / 2 + 30;

  const ORBIT_RX = 200;
  const ORBIT_RY = 60;
  const DOME_HEIGHT = 160;

  // ── Map horizontal (0-360°) to full circle azimuth ──
  // 0°=front (bottom of ellipse), 90°=right, 180°=back (top), 270°=left
  const azRad = (horizontalAngle / 180) * Math.PI;
  // In SVG: x = sin(az) goes right for 90°, y = cos(az) goes into screen
  const azX = Math.sin(azRad);
  const azZ = Math.cos(azRad);

  // ── Map vertical (-30 to 90°) to elevation ──
  // -30°=below eye level, 0°=eye level, 90°=directly above
  const elevNorm = Math.max(0, (verticalAngle + 30) / 120); // 0..1
  const elevRad = elevNorm * (Math.PI / 2);

  const cosElev = Math.cos(elevRad);
  const sinElev = Math.sin(elevRad);

  // 3D → 2D projection
  // In SVG: bottom of ellipse = front (0°), top = back (180°)
  const camX = CX + azX * cosElev * ORBIT_RX;
  const camY = CY - sinElev * DOME_HEIGHT + azZ * cosElev * ORBIT_RY;

  // Camera look-at direction
  const lookDx = CX - camX;
  const lookDy = CY - 30 - camY;
  const lookLen = Math.sqrt(lookDx * lookDx + lookDy * lookDy) || 1;
  const lookAngle = Math.atan2(lookDy, lookDx) * (180 / Math.PI);

  // Zoom handle along sight line
  const zoomNorm = zoom / 10;
  const distLineLen = Math.min(lookLen * 0.6, 80);
  const ndx = lookDx / lookLen;
  const ndy = lookDy / lookLen;
  const distHandleX = camX + ndx * distLineLen * zoomNorm;
  const distHandleY = camY + ndy * distLineLen * zoomNorm;

  // Azimuth handle on orbit ring
  const azHandleX = CX + Math.sin(azRad) * ORBIT_RX;
  const azHandleY = CY + Math.cos(azRad) * ORBIT_RY;

  // Elevation arc (pink)
  const elevArcPoints: string[] = [];
  if (elevRad > 0.05) {
    for (let i = 0; i <= 20; i++) {
      const t = (i / 20) * elevRad;
      const ex = CX + azX * Math.cos(t) * ORBIT_RX;
      const ey = CY - Math.sin(t) * DOME_HEIGHT + azZ * Math.cos(t) * ORBIT_RY;
      elevArcPoints.push(`${i === 0 ? "M" : "L"} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
    }
  }

  // Full orbit ring
  const orbitPath = `M ${CX} ${CY - ORBIT_RY} A ${ORBIT_RX} ${ORBIT_RY} 0 1 1 ${CX} ${CY + ORBIT_RY} A ${ORBIT_RX} ${ORBIT_RY} 0 1 1 ${CX} ${CY - ORBIT_RY}`;

  // Grid lines
  const gridLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = -3; i <= 3; i++) {
    const gx = CX + (i / 3) * ORBIT_RX;
    gridLines.push({ x1: gx, y1: CY - ORBIT_RY, x2: gx, y2: CY + ORBIT_RY });
  }
  for (let i = -2; i <= 2; i++) {
    const gy = CY + (i / 2) * ORBIT_RY;
    gridLines.push({ x1: CX - ORBIT_RX, y1: gy, x2: CX + ORBIT_RX, y2: gy });
  }

  // Dome meridians
  const meridians: string[] = [];
  for (let i = 0; i < 8; i++) {
    const mAz = (i / 8) * 2 * Math.PI;
    const points: string[] = [];
    for (let j = 0; j <= 20; j++) {
      const mElev = (j / 20) * (Math.PI / 2);
      const mx = CX + Math.sin(mAz) * Math.cos(mElev) * ORBIT_RX;
      const my = CY - Math.sin(mElev) * DOME_HEIGHT + Math.cos(mAz) * Math.cos(mElev) * ORBIT_RY;
      points.push(`${j === 0 ? "M" : "L"} ${mx.toFixed(1)} ${my.toFixed(1)}`);
    }
    meridians.push(points.join(" "));
  }

  const getSVGPoint = useCallback(
    (e: React.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (W / rect.width),
        y: (e.clientY - rect.top) * (H / rect.height),
      };
    },
    [W, H]
  );

  const handlePointerDown = useCallback(
    (target: DragTarget) => (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      setDragging(target);
      (e.target as SVGElement).setPointerCapture(e.pointerId);
    },
    [disabled]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || disabled) return;
      const pt = getSVGPoint(e);

      if (dragging === "azimuth") {
        // Map mouse to azimuth angle (full 360°)
        // Bottom of ellipse = 0° (front), top = 180° (back)
        const dx = pt.x - CX;
        const dy = pt.y - CY;
        let angle = Math.atan2(dx, dy) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        onRotateChange(Math.round(angle / 5) * 5 % 360);
      } else if (dragging === "elevation") {
        // Azimuth from mouse X
        const dx = pt.x - CX;
        const dy = pt.y - CY;
        let angle = Math.atan2(dx, dy) * (180 / Math.PI);
        if (angle < 0) angle += 360;
        onRotateChange(Math.round(angle / 5) * 5 % 360);

        // Elevation from mouse Y
        const baseY = CY;
        const topY = CY - DOME_HEIGHT;
        const relY = (baseY - pt.y) / (baseY - topY);
        const clampedElev = Math.max(0, Math.min(1, relY));
        // Map 0..1 to -30..90
        const newVert = Math.round((-30 + clampedElev * 120) / 5) * 5;
        onVerticalAngleChange(Math.max(-30, Math.min(90, newVert)));
      } else if (dragging === "distance") {
        const dxLine = pt.x - camX;
        const dyLine = pt.y - camY;
        const proj = (dxLine * ndx + dyLine * ndy) / distLineLen;
        const clamped = Math.max(0, Math.min(1, proj));
        onMoveForwardChange(Math.round(clamped * 20) / 2);
      }
    },
    [dragging, disabled, getSVGPoint, CX, CY, DOME_HEIGHT, ndx, ndy, camX, camY, distLineLen, onRotateChange, onVerticalAngleChange, onMoveForwardChange]
  );

  const handlePointerUp = useCallback(() => setDragging(null), []);

  const azActive = dragging === "azimuth" || hovered === "azimuth";
  const elActive = dragging === "elevation" || hovered === "elevation";
  const distActive = dragging === "distance" || hovered === "distance";

  // Azimuth label
  let azLabel = "Front";
  if (horizontalAngle >= 23 && horizontalAngle < 68) azLabel = "Front-Right";
  else if (horizontalAngle >= 68 && horizontalAngle < 113) azLabel = "Right";
  else if (horizontalAngle >= 113 && horizontalAngle < 158) azLabel = "Back-Right";
  else if (horizontalAngle >= 158 && horizontalAngle < 203) azLabel = "Back";
  else if (horizontalAngle >= 203 && horizontalAngle < 248) azLabel = "Back-Left";
  else if (horizontalAngle >= 248 && horizontalAngle < 293) azLabel = "Left";
  else if (horizontalAngle >= 293 && horizontalAngle < 338) azLabel = "Front-Left";

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex items-center gap-4 px-1">
        <span className="text-xs font-medium text-foreground/70">Drag the colored handles:</span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: COLOR.azimuth }}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLOR.azimuth }} />
          Horizontal
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: COLOR.elevation }}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLOR.elevation }} />
          Vertical
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: COLOR.distance }}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLOR.distance }} />
          Zoom
        </span>
      </div>

      <div className="relative w-full rounded-2xl bg-stone-50 border border-border overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full select-none"
          style={{ touchAction: "none" }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <defs>
            <filter id="handle-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.15" />
            </filter>
            <filter id="img-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000" floodOpacity="0.1" />
            </filter>
            <clipPath id="img-clip">
              <rect x={CX - 48} y={CY - 78} width="96" height="108" rx="6" />
            </clipPath>
            <radialGradient id="ground-fade" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#000" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Grid */}
          {gridLines.map((g, i) => (
            <line key={`grid-${i}`} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
              stroke="#d4d1cd" strokeWidth="0.5" opacity="0.3" />
          ))}

          <ellipse cx={CX} cy={CY + 10} rx={ORBIT_RX + 30} ry={ORBIT_RY + 15} fill="url(#ground-fade)" />

          {/* Dome meridians */}
          {meridians.map((path, i) => (
            <path key={`mer-${i}`} d={path} fill="none" stroke="#d4d1cd" strokeWidth="0.5" opacity="0.2" strokeDasharray="4 4" />
          ))}

          {/* Orbit ring (teal, full 360°) */}
          <ellipse cx={CX} cy={CY} rx={ORBIT_RX} ry={ORBIT_RY}
            fill="none" stroke={COLOR.azimuth} strokeWidth={azActive ? 3 : 2} opacity={azActive ? 0.8 : 0.5} />

          {/* Elevation arc (pink) */}
          {elevArcPoints.length > 0 && (
            <path d={elevArcPoints.join(" ")} fill="none"
              stroke={COLOR.elevation} strokeWidth={elActive ? 3.5 : 2.5}
              opacity={elActive ? 0.9 : 0.6} strokeLinecap="round" />
          )}

          {/* Product image */}
          {sourceImageUrl ? (
            <g filter="url(#img-shadow)">
              <image href={sourceImageUrl} x={CX - 48} y={CY - 78} width="96" height="108"
                clipPath="url(#img-clip)" preserveAspectRatio="xMidYMid slice" />
              <rect x={CX - 48} y={CY - 78} width="96" height="108" rx="6"
                fill="none" stroke="#e5e3e0" strokeWidth="1" />
            </g>
          ) : (
            <g>
              <rect x={CX - 40} y={CY - 60} width="80" height="90" rx="6"
                fill="#f5f4f2" stroke="#d4d1cd" strokeWidth="1" />
              <text x={CX} y={CY} textAnchor="middle" fontSize="10" fill="#9a958e" fontFamily="sans-serif">
                {t("orbit.product")}
              </text>
            </g>
          )}

          {/* Sight line */}
          <line x1={camX} y1={camY} x2={CX} y2={CY - 30}
            stroke="#9a958e" strokeWidth="1" opacity="0.3" strokeDasharray="5 4" />

          {/* Zoom line (amber) */}
          <line x1={camX} y1={camY} x2={camX + ndx * distLineLen} y2={camY + ndy * distLineLen}
            stroke={COLOR.distance} strokeWidth={distActive ? 3 : 2} opacity={distActive ? 0.8 : 0.4}
            strokeLinecap="round" />

          {/* Azimuth handle (teal, on orbit ring) */}
          <g
            onPointerDown={handlePointerDown("azimuth")}
            onPointerEnter={() => setHovered("azimuth")}
            onPointerLeave={() => setHovered(null)}
            style={{ cursor: disabled ? "default" : "grab" }}
          >
            <circle cx={azHandleX} cy={azHandleY} r={22} fill="transparent" />
            {azActive && <circle cx={azHandleX} cy={azHandleY} r={16} fill={COLOR.azimuth} opacity="0.12" />}
            <circle cx={azHandleX} cy={azHandleY} r={azActive ? 9 : 7}
              fill={COLOR.azimuth} stroke="#fff" strokeWidth="2.5" filter="url(#handle-shadow)" />
          </g>

          {/* Distance handle (amber) */}
          <g
            onPointerDown={handlePointerDown("distance")}
            onPointerEnter={() => setHovered("distance")}
            onPointerLeave={() => setHovered(null)}
            style={{ cursor: disabled ? "default" : "grab" }}
          >
            <circle cx={distHandleX} cy={distHandleY} r={20} fill="transparent" />
            {distActive && <circle cx={distHandleX} cy={distHandleY} r={14} fill={COLOR.distance} opacity="0.15" />}
            <circle cx={distHandleX} cy={distHandleY} r={distActive ? 8 : 6}
              fill={COLOR.distance} stroke="#fff" strokeWidth="2.5" filter="url(#handle-shadow)" />
          </g>

          {/* Camera / Elevation handle (pink) */}
          <g
            onPointerDown={handlePointerDown("elevation")}
            onPointerEnter={() => setHovered("elevation")}
            onPointerLeave={() => setHovered(null)}
            style={{ cursor: disabled ? "default" : "grab" }}
          >
            <circle cx={camX} cy={camY} r={26} fill="transparent" />
            {elActive && <circle cx={camX} cy={camY} r={22} fill={COLOR.elevation} opacity="0.1" />}
            <g transform={`translate(${camX}, ${camY}) rotate(${lookAngle})`}>
              <rect x={-14} y={-10} width={28} height={20} rx={4}
                fill={elActive ? "#1a1a1a" : "#3a3a3a"} stroke="#fff" strokeWidth="2" filter="url(#handle-shadow)" />
              <circle cx={0} cy={0} r={6} fill="none" stroke={COLOR.elevation} strokeWidth="2" />
              <circle cx={0} cy={0} r={3} fill={COLOR.elevation} />
              <rect x={8} y={-14} width={6} height={6} rx={1.5}
                fill={elActive ? "#1a1a1a" : "#3a3a3a"} stroke="#fff" strokeWidth="1" />
            </g>
          </g>

          {/* Value labels */}
          <text x={CX} y={CY + ORBIT_RY + 30} textAnchor="middle" fontSize="11"
            fill="#78716c" fontFamily="monospace" fontWeight="500">
            {horizontalAngle}° {azLabel} · {verticalAngle}° · {zoom.toFixed(1)}x zoom
          </text>
        </svg>
      </div>
    </div>
  );
}
