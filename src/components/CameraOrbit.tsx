"use client";

import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

interface CameraOrbitProps {
  rotateRightLeft: number;
  moveForward: number;
  verticalAngle: number;
  sourceImageUrl: string | null;
  onRotateChange: (v: number) => void;
  onMoveForwardChange: (v: number) => void;
  onVerticalAngleChange: (v: number) => void;
  disabled?: boolean;
}

type DragTarget = "camera" | "distance" | null;

export default function CameraOrbit({
  rotateRightLeft,
  moveForward,
  verticalAngle,
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
  const H = 420;
  const CX = W / 2;
  const CY = H / 2 + 10;

  // Dome parameters
  const DOME_RX = 190; // horizontal radius of dome base ellipse
  const DOME_RY = 65;  // vertical radius (perspective squeeze)
  const DOME_HEIGHT = 170; // height of dome above base

  // ── Map camera values to spherical coordinates on dome ──
  // Rotation: -90..90 maps to azimuth angle on dome (0..PI)
  // Vertical: -1..1 maps to elevation (0 = base, 1 = top viewed from bird's eye)
  // We invert: -1 = top (bird's eye), 1 = bottom (worm's eye = base level)
  const azimuth = ((rotateRightLeft + 90) / 180) * Math.PI; // 0..PI
  const elevation = ((-verticalAngle + 1) / 2); // 0..1, 0=base, 1=top

  // 3D position on dome surface (hemisphere)
  // spherical to projected 2D with perspective
  const phi = azimuth; // horizontal angle
  const theta = elevation * (Math.PI / 2); // 0 = equator, PI/2 = north pole

  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // 3D coordinates (right-hand, y-up)
  const x3d = cosTheta * cosPhi;
  const y3d = sinTheta;
  const z3d = cosTheta * sinPhi;

  // Project to 2D with simple perspective
  const camX = CX + x3d * DOME_RX;
  const camY = CY - y3d * DOME_HEIGHT - z3d * DOME_RY;

  // Camera "look at" direction — line from camera to center object
  const lookDx = CX - camX;
  const lookDy = CY - 30 - camY; // aim slightly above center
  const lookLen = Math.sqrt(lookDx * lookDx + lookDy * lookDy);
  const lookAngle = Math.atan2(lookDy, lookDx) * (180 / Math.PI);

  // Distance handle: along a line from camera toward object
  const distNorm = moveForward / 10; // 0..1
  const distLineLen = Math.min(lookLen * 0.6, 80);
  const ndx = lookDx / lookLen;
  const ndy = lookDy / lookLen;
  const distHandleX = camX + ndx * distLineLen * distNorm;
  const distHandleY = camY + ndy * distLineLen * distNorm;

  // Dome wireframe rings (latitude lines)
  const latRings: { rx: number; ry: number; cy: number; opacity: number }[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4; // 0=base, 1=top
    const ringTheta = t * (Math.PI / 2);
    const ringCosTheta = Math.cos(ringTheta);
    const ringRx = DOME_RX * ringCosTheta;
    const ringRy = DOME_RY * ringCosTheta;
    const ringCy = CY - Math.sin(ringTheta) * DOME_HEIGHT;
    latRings.push({ rx: ringRx, ry: ringRy, cy: ringCy, opacity: 0.15 + t * 0.15 });
  }

  // Dome meridian lines (longitude)
  const meridians: { path: string; opacity: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const mPhi = (i / 8) * Math.PI;
    const points: string[] = [];
    for (let j = 0; j <= 20; j++) {
      const mTheta = (j / 20) * (Math.PI / 2);
      const mx = CX + Math.cos(mTheta) * Math.cos(mPhi) * DOME_RX;
      const my = CY - Math.sin(mTheta) * DOME_HEIGHT - Math.cos(mTheta) * Math.sin(mPhi) * DOME_RY;
      points.push(`${j === 0 ? "M" : "L"} ${mx.toFixed(1)} ${my.toFixed(1)}`);
    }
    meridians.push({ path: points.join(" "), opacity: 0.12 });
  }

  const getSVGPoint = useCallback(
    (e: React.PointerEvent) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
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

      if (dragging === "camera") {
        // Map mouse position to azimuth (horizontal) and elevation (vertical)
        // Azimuth: x position relative to dome center
        const dx = pt.x - CX;
        // Clamp to dome width
        const clampedDx = Math.max(-DOME_RX, Math.min(DOME_RX, dx));
        // Map to angle: acos gives 0..PI
        const newAzimuth = Math.acos(clampedDx / DOME_RX);
        // Convert azimuth to rotation: 0..PI -> -90..90
        const newRotation = (newAzimuth / Math.PI) * 180 - 90;
        onRotateChange(Math.round(newRotation / 5) * 5);

        // Elevation from y position
        // Higher on screen = higher elevation
        const baseY = CY; // dome base
        const topY = CY - DOME_HEIGHT; // dome top
        const relY = (baseY - pt.y) / (baseY - topY);
        const clampedElev = Math.max(0, Math.min(1, relY));
        // Convert to verticalAngle: elevation 0..1 -> verticalAngle 1..-1
        const newVertical = -(clampedElev * 2 - 1);
        onVerticalAngleChange(Math.round(newVertical * 10) / 10);
      } else if (dragging === "distance") {
        // Project mouse position onto the look-direction line
        const dxLine = pt.x - camX;
        const dyLine = pt.y - camY;
        const proj = (dxLine * ndx + dyLine * ndy) / distLineLen;
        const clamped = Math.max(0, Math.min(1, proj));
        onMoveForwardChange(Math.round(clamped * 20) / 2);
      }
    },
    [dragging, disabled, getSVGPoint, CX, CY, DOME_RX, DOME_HEIGHT, ndx, ndy, camX, camY, distLineLen, onRotateChange, onVerticalAngleChange, onMoveForwardChange]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Info label
  let actionLabel = "";
  if (dragging === "camera") {
    const hDir = rotateRightLeft > 0 ? t("orbit.right") : rotateRightLeft < 0 ? t("orbit.left") : t("orbit.center");
    const vDir = verticalAngle < 0 ? t("orbit.birdsEye") : verticalAngle > 0 ? t("orbit.lowAngle") : t("orbit.eyeLevel");
    actionLabel = `${Math.abs(rotateRightLeft)}° ${hDir} · ${vDir}`;
  } else if (dragging === "distance") {
    actionLabel = `Zoom: ${moveForward.toFixed(1)}×`;
  } else if (hovered === "camera") {
    actionLabel = t("orbit.dragCamera");
  } else if (hovered === "distance") {
    actionLabel = t("orbit.dragZoom");
  }

  const cameraActive = dragging === "camera" || hovered === "camera";
  const distActive = dragging === "distance" || hovered === "distance";

  return (
    <div className="relative w-full rounded-2xl bg-white border border-border overflow-hidden shadow-sm">
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
          <filter id="dome-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="#000" floodOpacity="0.08" />
          </filter>
          <filter id="cam-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="img-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000" floodOpacity="0.12" />
          </filter>
          <clipPath id="img-clip">
            <rect x={CX - 50} y={CY - 80} width="100" height="110" rx="6" />
          </clipPath>
          {/* Gradient for dome */}
          <radialGradient id="dome-fill" cx="50%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#f5f4f2" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#e8e6e3" stopOpacity="0.15" />
          </radialGradient>
          {/* Gradient for base shadow */}
          <radialGradient id="base-shadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Base shadow ellipse */}
        <ellipse cx={CX} cy={CY + 15} rx={DOME_RX + 20} ry={DOME_RY + 10} fill="url(#base-shadow)" />

        {/* Dome wireframe — meridians (back half, behind object) */}
        {meridians.map((m, i) => (
          <path
            key={`m-${i}`}
            d={m.path}
            fill="none"
            stroke="#c4c0ba"
            strokeWidth="0.7"
            opacity={m.opacity}
            strokeDasharray="4 3"
          />
        ))}

        {/* Dome wireframe — latitude rings */}
        {latRings.map((ring, i) => (
          <ellipse
            key={`lat-${i}`}
            cx={CX}
            cy={ring.cy}
            rx={ring.rx}
            ry={ring.ry}
            fill="none"
            stroke="#c4c0ba"
            strokeWidth="0.7"
            opacity={ring.opacity}
            strokeDasharray={i === 0 ? "none" : "4 3"}
          />
        ))}

        {/* Base ellipse (solid) */}
        <ellipse
          cx={CX}
          cy={CY}
          rx={DOME_RX}
          ry={DOME_RY}
          fill="none"
          stroke="#d4d1cd"
          strokeWidth="1.2"
        />

        {/* Product image at center of dome */}
        {sourceImageUrl ? (
          <g filter="url(#img-shadow)">
            <image
              href={sourceImageUrl}
              x={CX - 50}
              y={CY - 80}
              width="100"
              height="110"
              clipPath="url(#img-clip)"
              preserveAspectRatio="xMidYMid slice"
            />
            <rect
              x={CX - 50}
              y={CY - 80}
              width="100"
              height="110"
              rx="6"
              fill="none"
              stroke="#d4d1cd"
              strokeWidth="1"
            />
          </g>
        ) : (
          <g>
            <rect
              x={CX - 40}
              y={CY - 60}
              width="80"
              height="90"
              rx="6"
              fill="#f5f4f2"
              stroke="#d4d1cd"
              strokeWidth="1"
            />
            <text x={CX} y={CY} textAnchor="middle" fontSize="10" fill="#9a958e" fontFamily="sans-serif">
              {t("orbit.product")}
            </text>
          </g>
        )}

        {/* Sight line from camera to object */}
        <line
          x1={camX}
          y1={camY}
          x2={CX}
          y2={CY - 30}
          stroke={cameraActive ? "#1a1a1a" : "#9a958e"}
          strokeWidth={cameraActive ? 1.5 : 1}
          opacity={cameraActive ? 0.5 : 0.25}
          strokeDasharray="5 4"
        />

        {/* Distance zoom line (from camera outward along sight line) */}
        <line
          x1={camX}
          y1={camY}
          x2={camX + ndx * distLineLen}
          y2={camY + ndy * distLineLen}
          stroke={distActive ? "#fbbf24" : "#d4d1cd"}
          strokeWidth={distActive ? 2.5 : 1.5}
          opacity={distActive ? 0.8 : 0.4}
          strokeLinecap="round"
        />

        {/* Distance handle */}
        <g
          onPointerDown={handlePointerDown("distance")}
          onPointerEnter={() => setHovered("distance")}
          onPointerLeave={() => setHovered(null)}
          style={{ cursor: disabled ? "default" : "grab" }}
        >
          <circle cx={distHandleX} cy={distHandleY} r={20} fill="transparent" />
          <circle
            cx={distHandleX}
            cy={distHandleY}
            r={distActive ? 8 : 6}
            fill="#fbbf24"
            stroke="#fff"
            strokeWidth="2"
            opacity={distActive ? 1 : 0.7}
          />
          {distActive && (
            <circle cx={distHandleX} cy={distHandleY} r="14" fill="#fbbf24" opacity="0.12" />
          )}
        </g>

        {/* Camera icon on dome */}
        <g
          onPointerDown={handlePointerDown("camera")}
          onPointerEnter={() => setHovered("camera")}
          onPointerLeave={() => setHovered(null)}
          style={{ cursor: disabled ? "default" : "grab" }}
        >
          {/* Large invisible hit area */}
          <circle cx={camX} cy={camY} r={24} fill="transparent" />

          {/* Glow ring */}
          {cameraActive && (
            <circle
              cx={camX}
              cy={camY}
              r={22}
              fill="none"
              stroke="#1a1a1a"
              strokeWidth="1.5"
              opacity="0.15"
              filter="url(#cam-glow)"
            />
          )}

          {/* Camera body */}
          <g transform={`translate(${camX}, ${camY}) rotate(${lookAngle})`}>
            {/* Main body */}
            <rect
              x={-14}
              y={-10}
              width={28}
              height={20}
              rx={4}
              fill={cameraActive ? "#1a1a1a" : "#3a3a3a"}
              stroke="#fff"
              strokeWidth="2"
            />
            {/* Lens */}
            <circle
              cx={0}
              cy={0}
              r={6}
              fill="none"
              stroke={cameraActive ? "#fbbf24" : "#666"}
              strokeWidth="2"
            />
            <circle
              cx={0}
              cy={0}
              r={3}
              fill={cameraActive ? "#fbbf24" : "#888"}
            />
            {/* Flash/viewfinder bump */}
            <rect
              x={8}
              y={-14}
              width={6}
              height={6}
              rx={1.5}
              fill={cameraActive ? "#1a1a1a" : "#3a3a3a"}
              stroke="#fff"
              strokeWidth="1"
            />
          </g>
        </g>

        {/* Info labels - current values */}
        <g>
          {/* Rotation value */}
          <text
            x={CX}
            y={CY + DOME_RY + 28}
            textAnchor="middle"
            fontSize="10"
            fill="#9a958e"
            fontFamily="sans-serif"
          >
            {rotateRightLeft > 0 ? `+${rotateRightLeft}` : rotateRightLeft}° {t("orbit.rotation")} · {
              verticalAngle < -0.3 ? t("orbit.birdsEye") : verticalAngle > 0.3 ? t("orbit.lowAngle") : t("orbit.eyeLevel")
            } · {moveForward.toFixed(1)}× {t("orbit.zoom")}
          </text>
        </g>

        {/* Action label at bottom */}
        {actionLabel && (
          <g>
            <rect
              x={CX - 100}
              y={H - 38}
              width="200"
              height="28"
              rx="14"
              fill="#f5f4f2"
              stroke="#e8e6e3"
              strokeWidth="1"
            />
            <text
              x={CX}
              y={H - 20}
              textAnchor="middle"
              fontSize="11"
              fill="#1a1a1a"
              fontFamily="monospace"
            >
              {actionLabel}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
