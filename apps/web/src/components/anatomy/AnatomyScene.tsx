"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Component,
  type ComponentRef,
  type ReactNode,
  type RefObject,
  Suspense,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { type Group, Vector3 } from "three";

import { ContextLayer } from "@/components/anatomy/ContextLayer";
import { CoronaryArteries } from "@/components/anatomy/CoronaryArteries";
import { flowAmount, flowClock } from "@/components/anatomy/flow";
import { GltfAnatomy } from "@/components/anatomy/GltfAnatomy";
import { HeartModel } from "@/components/anatomy/HeartModel";
import { HumanBody } from "@/components/anatomy/HumanBody";
import { VesselTooltip } from "@/components/anatomy/VesselTooltip";
import { cameraFor, CONTEXT_LAYERS, modeForZoom, vesselLabelAnchor } from "@/lib/anatomy";
import type { AnatomySceneProps, CameraView, Point3, ViewMode } from "@/types/anatomy";
import { type VesselName, VESSELS } from "@/types/prediction";

interface CameraRigProps {
  views: Record<ViewMode, CameraView>;
  mode: ViewMode;
  resetSignal: number;
  onModeChange?: (mode: ViewMode) => void;
}

/**
 * Moves the camera to the default view when the mode is chosen or a reset is requested.
 * Zooming far enough out of the heart view switches to the torso view (and back when
 * zooming in); that switch keeps the camera where the user has put it.
 */
function CameraRig({ views, mode, resetSignal, onModeChange }: CameraRigProps) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const view = views[mode];
  const zoomSwitched = useRef(false);

  useEffect(() => {
    if (zoomSwitched.current) {
      zoomSwitched.current = false;
      return;
    }
    camera.position.set(...view.position);
    if (controls.current) {
      controls.current.target.set(...view.target);
      controls.current.update();
    } else {
      camera.lookAt(...view.target);
    }
    invalidate();
  }, [camera, invalidate, view, resetSignal]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan
      enableDamping={false}
      // One zoom range across both modes, so zooming can carry from one into the other.
      minDistance={onModeChange ? views.heart.minDistance : view.minDistance}
      maxDistance={onModeChange ? views.torso.maxDistance : view.maxDistance}
      onChange={() => {
        if (!onModeChange || !controls.current) return;
        const next = modeForZoom(controls.current.getDistance(), mode, views);
        if (next !== mode) {
          zoomSwitched.current = true;
          onModeChange(next);
        }
      }}
    />
  );
}

/** Advances the shared flow clock while the animation is on. */
function FlowTicker({ running }: { running: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    flowAmount.value = running ? 1 : 0;
    invalidate();
  }, [running, invalidate]);
  useFrame((_, delta) => {
    // Clamp so a background tab coming back does not jump the animation.
    if (running) flowClock.value += Math.min(delta, 0.1);
  });
  return null;
}

type LabelRefs = RefObject<Partial<Record<VesselName, HTMLDivElement | null>>>;

interface LabelProjectorProps {
  labels: LabelRefs;
  /** Label anchor per vessel and the heart's centre, in the parent group's coordinates. */
  anchors: Record<VesselName, Point3>;
  center: Point3;
}

/**
 * Keeps the DOM vessel labels pinned to their vessels. Anchors are in the coordinates of
 * the group this sits in; labels on the far side of the heart are faded.
 */
function LabelProjector({ labels, anchors, center }: LabelProjectorProps) {
  const group = useRef<Group>(null);
  const size = useThree((state) => state.size);
  const points = useMemo(
    () => VESSELS.map((name) => ({ name, local: new Vector3(...anchors[name]) })),
    [anchors],
  );
  const scratch = useMemo(
    () => ({ world: new Vector3(), center: new Vector3(), toCamera: new Vector3() }),
    [],
  );

  useFrame(({ camera }) => {
    const parent = group.current;
    if (!parent) return;
    // This runs before the renderer updates matrices, so bring them up to date first.
    parent.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    const heart = scratch.center.set(...center).applyMatrix4(parent.matrixWorld);
    for (const { name, local } of points) {
      const element = labels.current[name];
      if (!element) continue;
      const world = scratch.world.copy(local).applyMatrix4(parent.matrixWorld);
      const outwardX = world.x - heart.x;
      const outwardY = world.y - heart.y;
      const outwardZ = world.z - heart.z;
      const toCamera = scratch.toCamera.copy(camera.position).sub(world);
      const facing = outwardX * toCamera.x + outwardY * toCamera.y + outwardZ * toCamera.z > 0;
      const projected = world.project(camera);
      const x = (projected.x * 0.5 + 0.5) * size.width;
      const y = (-projected.y * 0.5 + 0.5) * size.height;
      element.style.transform =
        "translate(" + x.toFixed(1) + "px, " + y.toFixed(1) + "px) translate(-50%, -150%)";
      element.style.opacity = projected.z > 1 ? "0" : facing ? "1" : "0.4";
    }
  });

  return <group ref={group} />;
}

const PLACEHOLDER_ANCHORS: Record<VesselName, Point3> = {
  LAD: vesselLabelAnchor("LAD"),
  LCX: vesselLabelAnchor("LCX"),
  RCA: vesselLabelAnchor("RCA"),
};
const ORIGIN: Point3 = [0, 0, 0];

/** A context layer that fails to load is simply not drawn; the rest of the scene carries on. */
class LayerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** If a supplied asset fails to load or render, draw the placeholder and report it once. */
class AssetBoundary extends Component<
  { fallback: ReactNode; onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface SceneProps extends AnatomySceneProps {
  onAssetError: () => void;
  onAssetLoaded: () => void;
}

export default function AnatomyScene({
  source,
  mode,
  layers,
  colorScheme,
  flow,
  vessels,
  selected,
  hovered,
  resetSignal,
  onSelect,
  onHover,
  onModeChange,
  onAssetError,
  onAssetLoaded,
}: SceneProps) {
  const labels: LabelRefs = useRef({});
  const views = cameraFor(source);
  const view = views[mode];

  const placeholder = (
    <>
      <HumanBody visible={mode === "torso"} />
      <HeartModel dimmed={selected !== null} onBackgroundClick={() => onSelect(null)}>
        <CoronaryArteries vessels={vessels} selected={selected} hovered={hovered} onSelect={onSelect} onHover={onHover} />
        <LabelProjector labels={labels} anchors={PLACEHOLDER_ANCHORS} center={ORIGIN} />
      </HeartModel>
    </>
  );

  return (
    <>
      <Canvas
        // Rendered on demand (interaction or prop change), capped pixel ratio, no shadows or
        // textures: keeps the view smooth on integrated graphics.
        // The flow animation needs a frame every tick; with it off, nothing is drawn at rest.
        frameloop={flow && source.kind === "gltf" ? "always" : "demand"}
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "default" }}
        camera={{ fov: 38, near: 0.1, far: 120, position: view.position }}
        onPointerMissed={() => onSelect(null)}
        aria-label="Interactive 3D view of the heart and coronary vessels"
        role="img"
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 5, 6]} intensity={1.6} />
        <directionalLight position={[-4, -1, -3]} intensity={0.5} />
        <hemisphereLight args={["#ffffff", "#3a2a2a", 0.35]} />
        <CameraRig views={views} mode={mode} resetSignal={resetSignal} onModeChange={onModeChange} />
        <FlowTicker running={flow && source.kind === "gltf"} />
        {source.kind === "gltf" ? (
          <AssetBoundary fallback={null} onError={onAssetError}>
            <Suspense fallback={null}>
              <GltfAnatomy
                source={source}
                showBody={mode === "torso"}
                layers={layers}
                colorScheme={colorScheme}
                vessels={vessels}
                selected={selected}
                hovered={hovered}
                onSelect={onSelect}
                onHover={onHover}
                onLoaded={onAssetLoaded}
              />
              <LabelProjector labels={labels} anchors={source.labelAnchors} center={source.heartCenter} />
            </Suspense>
          </AssetBoundary>
        ) : null}
        {source.kind === "gltf"
          ? CONTEXT_LAYERS.map((name) => {
              const layerAsset = source.layerAssets[name];
              if (!layerAsset || !layers[name]) return null;
              return (
                <LayerBoundary key={name}>
                  <Suspense fallback={null}>
                    <ContextLayer layer={name} url={layerAsset.url} colorScheme={colorScheme} />
                  </Suspense>
                </LayerBoundary>
              );
            })
          : null}
        {source.kind === "gltf" ? null : (
          placeholder
        )}
      </Canvas>
      <div className="viewer__labels" aria-hidden="true">
        {VESSELS.map((name) => (
          <div
            key={name}
            className="viewer__label"
            ref={(element) => {
              labels.current[name] = element;
            }}
          >
            <VesselTooltip state={vessels[name]} expanded={hovered === name || selected === name} />
          </div>
        ))}
      </div>
    </>
  );
}
