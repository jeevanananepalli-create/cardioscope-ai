import type { AnatomySceneProps } from "@/types/anatomy";

/**
 * Stand-in for the WebGL scene (which cannot run in jsdom). It exposes what the scene is
 * told to draw and lets a test trigger the callbacks a pointer would.
 */
export default function SceneMock(props: AnatomySceneProps & { onAssetError: () => void }) {
  return (
    <div
      data-testid="scene"
      data-mode={props.mode}
      data-source={props.source.kind}
      data-selected={props.selected ?? ""}
      data-hovered={props.hovered ?? ""}
      data-reset={props.resetSignal}
    >
      {(["LAD", "LCX", "RCA"] as const).map((name) => (
        <button
          key={name}
          data-testid={`mesh-${name}`}
          data-color={props.vessels[name].color}
          data-category={props.vessels[name].category ?? ""}
          data-probability={props.vessels[name].probability ?? ""}
          onClick={() => props.onSelect(name)}
          onMouseEnter={() => props.onHover(name)}
        >
          mesh {name}
        </button>
      ))}
      <button onClick={() => props.onSelect(null)}>empty space</button>
      <button onClick={props.onAssetError}>fail asset</button>
    </div>
  );
}

export function enableWebgl() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({}) as unknown as RenderingContext,
  );
}
