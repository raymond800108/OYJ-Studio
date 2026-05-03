"use client";

import React, { Suspense, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  useGLTF,
  Environment,
  Center,
  Lightformer,
  Html,
} from "@react-three/drei";
import { AlertTriangle, Sun, Ruler, Crosshair } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { TKey } from "@/lib/i18n";
import * as THREE from "three";

interface ModelViewerProps {
  modelUrl: string;
  onCalibrationChange?: (sizeMm: { x: number; y: number; z: number } | null) => void;
}

/* ─── Model loader ──────────────────────────────────────────────── */

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => enhanceMaterial(mat));
        } else {
          enhanceMaterial(mesh.material);
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }, [scene]);

  return (
    <Center>
      <group>
        <primitive object={scene} />
      </group>
    </Center>
  );
}

/** Enhance PBR materials for better metallic rendering */
function enhanceMaterial(mat: THREE.Material) {
  if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
    const m = mat as THREE.MeshStandardMaterial;
    m.envMapIntensity = 2.0;
    m.needsUpdate = true;
  }
  if ((mat as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
    const m = mat as THREE.MeshPhysicalMaterial;
    m.envMapIntensity = 2.0;
    m.needsUpdate = true;
  }
}

/* ─── Bounding-box dimension overlay ────────────────────────────── */

/** Imperative THREE.Line wrapper to avoid JSX <line> / SVG conflict */
function ThreeLine({ points, color }: { points: THREE.Vector3[]; color: string }) {
  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color });
    return new THREE.Line(geo, mat);
  }, [points, color]);
  return <primitive object={line} />;
}

function DimensionLine({
  start,
  end,
  label,
  color = "#666",
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  label: string;
  color?: string;
}) {
  const mid = useMemo(() => new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5), [start, end]);
  const len = useMemo(() => start.distanceTo(end), [start, end]);
  const capSize = len * 0.04;
  const dir = useMemo(() => new THREE.Vector3().subVectors(end, start).normalize(), [start, end]);

  const perp = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3().crossVectors(dir, up);
    if (p.length() < 0.01) p.set(1, 0, 0);
    return p.normalize().multiplyScalar(capSize);
  }, [dir, capSize]);

  const cap1Points = useMemo(() => [
    new THREE.Vector3().copy(start).add(perp),
    new THREE.Vector3().copy(start).sub(perp),
  ], [start, perp]);

  const cap2Points = useMemo(() => [
    new THREE.Vector3().copy(end).add(perp),
    new THREE.Vector3().copy(end).sub(perp),
  ], [end, perp]);

  return (
    <group>
      <ThreeLine points={[start, end]} color={color} />
      <ThreeLine points={cap1Points} color={color} />
      <ThreeLine points={cap2Points} color={color} />
      <Html position={mid} center style={{ pointerEvents: "none" }}>
        <div
          style={{
            background: "rgba(0,0,0,0.75)",
            color: "#fff",
            padding: "2px 7px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "monospace",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

/** Format a raw 3D-unit value into a display string, applying scale if calibrated */
function formatDim(raw: number, scale: number | null): string {
  if (scale !== null) {
    return `${(raw * scale).toFixed(1)} mm`;
  }
  return raw.toFixed(2);
}

function BoundingBoxDimensions({
  url,
  visible,
  scale,
  onBboxReady,
}: {
  url: string;
  visible: boolean;
  scale: number | null;
  onBboxReady?: (size: THREE.Vector3) => void;
}) {
  const { scene } = useGLTF(url);
  const [dims, setDims] = useState<{
    min: THREE.Vector3;
    max: THREE.Vector3;
    size: THREE.Vector3;
  } | null>(null);
  const { t } = useI18n();
  const computed = useRef(false);

  // Compute bounding box after Center has repositioned the model (defer 2 frames)
  useFrame(() => {
    if (computed.current) return;
    computed.current = true;
    requestAnimationFrame(() => {
      const box = new THREE.Box3().setFromObject(scene);
      const sz = new THREE.Vector3();
      box.getSize(sz);
      setDims({ min: box.min.clone(), max: box.max.clone(), size: sz.clone() });
      onBboxReady?.(sz.clone());
    });
  });

  // Reset if URL changes
  useEffect(() => {
    computed.current = false;
    setDims(null);
  }, [url]);

  // All useMemo hooks must run unconditionally (Rules of Hooks)
  const boxObj = useMemo(() => {
    if (!dims) return null;
    const { min, max, size } = dims;
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
    const mat = new THREE.LineBasicMaterial({ color: "#999", transparent: true, opacity: 0.4 });
    const seg = new THREE.LineSegments(edges, mat);
    const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    seg.position.copy(center);
    return seg;
  }, [dims]);

  const lines = useMemo(() => {
    if (!dims) return null;
    const { min, max, size } = dims;
    const offset = Math.max(size.x, size.y, size.z) * 0.12;
    return {
      w: {
        start: new THREE.Vector3(min.x, min.y - offset, max.z + offset),
        end: new THREE.Vector3(max.x, min.y - offset, max.z + offset),
      },
      h: {
        start: new THREE.Vector3(max.x + offset, min.y, max.z + offset),
        end: new THREE.Vector3(max.x + offset, max.y, max.z + offset),
      },
      d: {
        start: new THREE.Vector3(min.x - offset, min.y - offset, min.z),
        end: new THREE.Vector3(min.x - offset, min.y - offset, max.z),
      },
      size,
    };
  }, [dims]);

  if (!visible || !dims || !boxObj || !lines) return null;

  return (
    <group>
      {/* Wireframe bounding box */}
      <primitive object={boxObj} />

      {/* Dimension lines */}
      <DimensionLine
        start={lines.w.start}
        end={lines.w.end}
        label={`${t("3d.width" as TKey)} ${formatDim(lines.size.x, scale)}`}
        color="#e55"
      />
      <DimensionLine
        start={lines.h.start}
        end={lines.h.end}
        label={`${t("3d.height" as TKey)} ${formatDim(lines.size.y, scale)}`}
        color="#5a5"
      />
      <DimensionLine
        start={lines.d.start}
        end={lines.d.end}
        label={`${t("3d.depth" as TKey)} ${formatDim(lines.size.z, scale)}`}
        color="#55e"
      />
    </group>
  );
}

/* ─── Interactive ruler ─────────────────────────────────────────── */

function RulerPoint({ position }: { position: THREE.Vector3 }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.015, 16, 16]} />
      <meshBasicMaterial color="#ff3333" />
    </mesh>
  );
}

function RulerLine({
  a,
  b,
  label,
}: {
  a: THREE.Vector3;
  b: THREE.Vector3;
  label: string;
}) {
  const mid = useMemo(() => new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), [a, b]);

  return (
    <group>
      <ThreeLine points={[a, b]} color="#ff3333" />
      <Html position={mid} center style={{ pointerEvents: "none" }}>
        <div
          style={{
            background: "rgba(220, 40, 40, 0.9)",
            color: "#fff",
            padding: "3px 8px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "monospace",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

function InteractiveRuler({
  active,
  points,
  onAddPoint,
  scale,
}: {
  active: boolean;
  points: THREE.Vector3[];
  onAddPoint: (pt: THREE.Vector3) => void;
  scale: number | null;
}) {
  const { camera, gl, scene } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!active) return;

    const canvas = gl.domElement;

    const onDown = (e: PointerEvent) => {
      downPos.current = { x: e.clientX, y: e.clientY };
    };

    const onUp = (e: PointerEvent) => {
      if (!downPos.current) return;
      // Only register click if mouse didn't move much (not a drag)
      const dx = e.clientX - downPos.current.x;
      const dy = e.clientY - downPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) {
        downPos.current = null;
        return;
      }
      downPos.current = null;

      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.current.setFromCamera(ndc, camera);
      const intersections = raycaster.current.intersectObjects(scene.children, true);

      // Filter to actual meshes (not helpers or HTML)
      const hit = intersections.find(
        (i) => (i.object as THREE.Mesh).isMesh && i.object.visible
      );
      if (hit) {
        onAddPoint(hit.point.clone());
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [active, camera, gl, scene, onAddPoint]);

  if (!active && points.length === 0) return null;

  const dist =
    points.length === 2 ? points[0].distanceTo(points[1]) : null;

  return (
    <group>
      {points.map((pt, i) => (
        <RulerPoint key={i} position={pt} />
      ))}
      {points.length === 2 && dist !== null && (
        <RulerLine
          a={points[0]}
          b={points[1]}
          label={`${t("3d.distance" as TKey)} ${formatDim(dist, scale)}`}
        />
      )}
    </group>
  );
}

/* ─── Renderer & environment ────────────────────────────────────── */

function RendererSetup({ exposure }: { exposure: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposure;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    scene.background = new THREE.Color("#ffffff");
  }, [gl, scene, exposure]);
  return null;
}

function MeshyStudioEnvironment() {
  return (
    <Environment resolution={1024}>
      <Lightformer form="rect" intensity={0.7} scale={[100, 100, 1]} position={[0, 0, -20]} color="#8a8078" />
      <Lightformer form="rect" intensity={0.7} scale={[100, 100, 1]} position={[0, 0, 20]} rotation={[0, Math.PI, 0]} color="#8a8078" />
      <Lightformer form="rect" intensity={0.6} scale={[100, 100, 1]} position={[-20, 0, 0]} rotation={[0, Math.PI / 2, 0]} color="#8a8078" />
      <Lightformer form="rect" intensity={0.6} scale={[100, 100, 1]} position={[20, 0, 0]} rotation={[0, -Math.PI / 2, 0]} color="#8a8078" />
      <Lightformer form="rect" intensity={0.5} scale={[100, 100, 1]} position={[0, -20, 0]} rotation={[-Math.PI / 2, 0, 0]} color="#7a7068" />
      <Lightformer form="rect" intensity={0.6} scale={[100, 100, 1]} position={[0, 20, 0]} rotation={[Math.PI / 2, 0, 0]} color="#9a9088" />

      {/* KEY LIGHT */}
      <Lightformer form="rect" intensity={3.5} position={[4, 5, 4]} scale={[5, 4, 1]} color="#ffe8c8" target={[0, 0, 0]} />
      {/* FILL LIGHT */}
      <Lightformer form="rect" intensity={2} position={[-5, 3, 2]} scale={[6, 5, 1]} color="#dde4f0" target={[0, 0, 0]} />
      {/* RIM/BACK LIGHT */}
      <Lightformer form="rect" intensity={2.5} position={[0, 4, -5]} rotation={[0, Math.PI, 0]} scale={[8, 3, 1]} color="#ffd9a0" />
      {/* TOP SOFTBOX */}
      <Lightformer form="rect" intensity={2} position={[0, 8, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 10, 1]} color="#f5efe6" />
      {/* UNDER FILL */}
      <Lightformer form="rect" intensity={1} position={[0, -3, 2]} rotation={[-Math.PI / 4, 0, 0]} scale={[8, 4, 1]} color="#e8e0d8" />
      {/* SPECULAR KICKS */}
      <Lightformer form="circle" intensity={5} position={[2, 6, 3]} scale={1.2} color="#ffffff" />
      <Lightformer form="circle" intensity={3.5} position={[-3, 5, -1]} scale={1} color="#ffffff" />
      <Lightformer form="circle" intensity={3} position={[1, 3, -4]} scale={0.8} color="#fff5e6" />
    </Environment>
  );
}

/* ─── Error boundary ────────────────────────────────────────────── */

function ModelErrorFallback() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] rounded-2xl border border-border bg-card p-8">
      <AlertTriangle className="w-8 h-8 text-muted" />
      <p className="text-sm font-medium mt-4">{t("3d.failed")}</p>
      <p className="text-xs text-muted mt-1">{t("3d.cannotRender")}</p>
    </div>
  );
}

class ModelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return <ModelErrorFallback />;
    return this.props.children;
  }
}

/* ─── Scene (canvas + overlays) ─────────────────────────────────── */

function Scene({
  modelUrl,
  exposure,
  scale,
  onBboxReady,
}: {
  modelUrl: string;
  exposure: number;
  scale: number | null;
  onBboxReady: (size: THREE.Vector3) => void;
}) {
  const { t } = useI18n();
  const [showDimensions, setShowDimensions] = useState(false);
  const [rulerMode, setRulerMode] = useState(false);
  const [rulerPoints, setRulerPoints] = useState<THREE.Vector3[]>([]);

  const handleAddPoint = useCallback((pt: THREE.Vector3) => {
    setRulerPoints((prev) => {
      if (prev.length >= 2) return [pt];
      return [...prev, pt];
    });
  }, []);

  const toggleRuler = useCallback(() => {
    setRulerMode((prev) => {
      if (!prev) setRulerPoints([]);
      return !prev;
    });
  }, []);

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden border border-border shadow-sm"
      style={{ height: 450, cursor: rulerMode ? "crosshair" : undefined }}
    >
      <Canvas
        camera={{ position: [0, 1.2, 3], fov: 40 }}
        shadows
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
        style={{ background: "#ffffff" }}
      >
        <RendererSetup exposure={exposure} />
        <ambientLight intensity={0.08} color="#f5efe6" />

        <Suspense fallback={null}>
          <Model url={modelUrl} />
          <BoundingBoxDimensions url={modelUrl} visible={showDimensions} scale={scale} onBboxReady={onBboxReady} />
          <InteractiveRuler
            active={rulerMode}
            points={rulerPoints}
            onAddPoint={handleAddPoint}
            scale={scale}
          />
          <MeshyStudioEnvironment />
        </Suspense>

        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={1}
          maxDistance={10}
          autoRotate={!rulerMode && !showDimensions}
          autoRotateSpeed={0.8}
          makeDefault
        />
      </Canvas>

      {/* Bottom overlays */}
      <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-full bg-foreground/90 text-xs text-background font-medium shadow-sm">
        {t("3d.preview")}
      </div>
      <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-foreground/5 backdrop-blur-sm border border-border text-[10px] text-muted shadow-sm">
        {t("3d.controls")}
      </div>

      {/* Tool buttons — top right */}
      <div className="absolute top-3 right-3 flex gap-1.5">
        <button
          onClick={() => setShowDimensions((v) => !v)}
          title={t("3d.dimensions" as TKey)}
          className={`p-2 rounded-lg border backdrop-blur-sm shadow-sm transition-all ${
            showDimensions
              ? "bg-foreground text-background border-foreground"
              : "bg-foreground/5 text-muted border-border hover:bg-foreground/10"
          }`}
        >
          <Ruler className="w-4 h-4" />
        </button>
        <button
          onClick={toggleRuler}
          title={t("3d.measure" as TKey)}
          className={`p-2 rounded-lg border backdrop-blur-sm shadow-sm transition-all ${
            rulerMode
              ? "bg-foreground text-background border-foreground"
              : "bg-foreground/5 text-muted border-border hover:bg-foreground/10"
          }`}
        >
          <Crosshair className="w-4 h-4" />
        </button>
      </div>

      {/* Ruler instruction banner */}
      {rulerMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-red-500/90 text-white text-xs font-medium shadow-md">
          {rulerPoints.length < 2
            ? t("3d.clickToMeasure" as TKey)
            : t("3d.clearRuler" as TKey)}
        </div>
      )}

      {/* Calibration status pill — bottom center */}
      {(showDimensions || rulerMode) && (
        <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-medium shadow-sm ${
          scale !== null
            ? "bg-green-500/90 text-white"
            : "bg-amber-500/90 text-white"
        }`}>
          {scale !== null ? `✓ ${t("3d.calibrated" as TKey)}` : t("3d.uncalibrated" as TKey)}
        </div>
      )}
    </div>
  );
}

/* ─── Main export ───────────────────────────────────────────────── */

export default function ModelViewer({ modelUrl, onCalibrationChange }: ModelViewerProps) {
  const [exposure, setExposure] = useState(1.2);
  // Calibration state lives here so it persists across tool toggles
  const [scale, setScale] = useState<number | null>(null);
  const [rawBboxSize, setRawBboxSize] = useState<THREE.Vector3 | null>(null);
  const [calibInput, setCalibInput] = useState("");
  const [calibAxis, setCalibAxis] = useState<"x" | "y" | "z">("x");
  const { t } = useI18n();

  // Reset calibration when model changes
  useEffect(() => {
    setScale(null);
    setRawBboxSize(null);
    onCalibrationChange?.(null);
  }, [modelUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyCalibration = useCallback(() => {
    if (!rawBboxSize) return;
    const mm = parseFloat(calibInput);
    if (!mm || mm <= 0) return;
    const rawVal = calibAxis === "x" ? rawBboxSize.x : calibAxis === "y" ? rawBboxSize.y : rawBboxSize.z;
    if (rawVal <= 0) return;
    const newScale = mm / rawVal;
    setScale(newScale);
    onCalibrationChange?.({
      x: rawBboxSize.x * newScale,
      y: rawBboxSize.y * newScale,
      z: rawBboxSize.z * newScale,
    });
  }, [rawBboxSize, calibInput, calibAxis, onCalibrationChange]);

  return (
    <ModelErrorBoundary>
      <div className="space-y-3">
        <Scene modelUrl={modelUrl} exposure={exposure} scale={scale} onBboxReady={(sz) => setRawBboxSize(sz)} />

        {/* Exposure slider */}
        <div className="flex items-center gap-3 px-1">
          <Sun className="w-3.5 h-3.5 text-muted flex-shrink-0" />
          <input
            type="range"
            min={0.5}
            max={2.5}
            step={0.05}
            value={exposure}
            onChange={(e) => setExposure(parseFloat(e.target.value))}
            className="w-full"
          />
          <span className="text-[11px] font-mono text-muted w-10 text-right flex-shrink-0">
            {exposure.toFixed(1)}
          </span>
        </div>

        {/* Calibration panel */}
        <div className="flex items-center gap-2 px-1 py-2 rounded-xl bg-card border border-border">
          <Ruler className="w-3.5 h-3.5 text-muted flex-shrink-0 ml-2" />
          <span className="text-[11px] text-muted flex-shrink-0">{t("3d.calibrate" as TKey)}</span>
          <select
            value={calibAxis}
            onChange={(e) => setCalibAxis(e.target.value as "x" | "y" | "z")}
            className="text-[11px] bg-transparent border border-border rounded px-1.5 py-0.5"
          >
            <option value="x">{t("3d.width" as TKey)} (X)</option>
            <option value="y">{t("3d.height" as TKey)} (Y)</option>
            <option value="z">{t("3d.depth" as TKey)} (Z)</option>
          </select>
          <input
            type="number"
            min={0.1}
            step={0.1}
            placeholder="mm"
            value={calibInput}
            onChange={(e) => setCalibInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyCalibration()}
            className="w-16 text-[11px] bg-transparent border border-border rounded px-2 py-0.5 text-center"
          />
          <button
            onClick={applyCalibration}
            disabled={!rawBboxSize || !calibInput}
            className="text-[11px] px-2.5 py-0.5 rounded bg-foreground text-background font-medium disabled:opacity-30 hover:opacity-80 transition-opacity"
          >
            {t("3d.calibrateApply" as TKey)}
          </button>
          {scale !== null && (
            <span className="text-[10px] text-green-600 font-medium ml-auto mr-2">✓</span>
          )}
        </div>
      </div>
    </ModelErrorBoundary>
  );
}
