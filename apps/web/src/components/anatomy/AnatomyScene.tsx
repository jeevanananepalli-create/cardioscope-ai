"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, type ComponentRef, type ReactNode, type RefObject, Suspense, useEffect, useMemo, useRef } from "react";
import { type Group, Vector3 } from "three";

import { CoronaryArteries } from "@/components/anatomy/CoronaryArteries";
import { GltfAnatomy } from "@/components/anatomy/GltfAnatomy";
import { HeartModel } from "@/components/anatomy/HeartModel";
import { HumanBody } from "@/components/anatomy/HumanBody";
import { VesselTooltip } from "@/components/anatomy/VesselTooltip";
import { CAMERA_BY_MODE, vesselLabelAnchor } from "@/lib/anatomy";
import type { AnatomySceneProps, ViewMode } from "@/types/anatomy";
import { type VesselName, VESSELS } from "@/types/prediction";

/** Moves the camera to the default view when the mode changes or a reset is requested. */
function CameraRig({ mode, resetSignal }: { mode: ViewMode; resetSignal: number }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const view = CAMERA_BY_MODE[mode];

  useEffect(() => {
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
      minDistance={view.minDistance}
      maxDistance={view.maxDistance}
    />
  );
}

type LabelRefs = RefObject<Partial<Record<VesselName, HTMLDivElement | null>>>;

/**
 * Keeps the DOM vessel labels pinned to their vessels. Lives inside the heart group, so the
 * anchors move with it; labels on the far side of the heart are faded.
 */
function LabelProjector({ labels }: { labels: LabelRefs }) {
  const group = useRef<Group>(null);
  const size = useThree((state) => state.size);
  const anchors = useMemo(
    () => VESSELS.map((name) => ({ name, local: new Vector3(...vesselLabelAnchor(name)) })),
    [],
  );
  const scratch = useMemo(() => ({ world: new Vector3(), axis: new Vector3(), toCamera: new Vector3() }), []);

  useFrame(({ camera }) => {
    const parent = group.current;
    if (!parent) return;
    // This runs before the renderer updates matrices, so bring them up to date first.
    parent.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    for (const { name, local } of anchors) {
      const element = labels.current[name];
      if (!element) continue;
      const world = scratch.world.copy(local).applyMatrix4(parent.matrixWorld);
      // Outward direction at the anchor: from the heart's long axis to the anchor.
      const outward = scratch.axis.set(0, local.y, 0).applyMatrix4(parent.matrixWorld).sub(world).negate();
      const facing = outward.dot(scratch.toCamera.copy(camera.position).sub(world)) > 0;
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
}

export default function AnatomyScene({
  source,
  mode,
  vessels,
  selected,
  hovered,
  resetSignal,
  onSelect,
  onHover,
  onAssetError,
}: SceneProps) {
  const labels: LabelRefs = useRef({});
  const placeholder = (
    <>
      <HumanBody visible={mode === "torso"} />
      <HeartModel dimmed={selected !== null} onBackgroundClick={() => onSelect(null)}>
        <CoronaryArteries vessels={vessels} selected={selected} hovered={hovered} onSelect={onSelect} onHover={onHover} />
        <LabelProjector labels={labels} />
      </HeartModel>
    </>
  );

  return (
    <>
    <Canvas
      // Rendered on demand (interaction or prop change), capped pixel ratio, no shadows or
      // textures: keeps the view smooth on integrated graphics.
      frameloop="demand"
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "default" }}
      camera={{ fov: 38, near: 0.1, far: 60, position: CAMERA_BY_MODE[mode].position }}
      onPointerMissed={() => onSelect(null)}
      aria-label="Interactive 3D view of the heart and coronary vessels"
      role="img"
    >
      <color attach="background" args={["#0f1722"]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 5, 6]} intensity={1.5} />
      <directionalLight position={[-4, -1, -3]} intensity={0.45} />
      <CameraRig mode={mode} resetSignal={resetSignal} />
      {source.kind === "gltf" ? (
        <AssetBoundary fallback={placeholder} onError={onAssetError}>
          <Suspense fallback={null}>
            <GltfAnatomy
              source={source}
              showTorso={mode === "torso"}
              vessels={vessels}
              selected={selected}
              hovered={hovered}
              onSelect={onSelect}
              onHover={onHover}
            />
          </Suspense>
        </AssetBoundary>
      ) : (
        placeholder
      )}
    </Canvas>
    {source.kind === "placeholder" ? (
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
    ) : null}
    </>
  );
}
