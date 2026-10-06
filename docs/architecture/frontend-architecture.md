# Frontend architecture

Next.js (App Router) with React and TypeScript. The dashboard is a single client-rendered page;
`src/app/page.tsx` renders `Dashboard`.

## Layout

| Area | Components |
|---|---|
| Top | `AppHeader` (service status, model version), `SafetyDisclaimer` (sticky) |
| Left | `PatientForm` — generated from `GET /feature-schema` |
| Centre | `AnatomyViewer` — 3D view, view modes, layers, vessel buttons |
| Right | `RiskOverview` (CAD), `VesselRiskCards`, `VesselExplanation` (selected vessel) |
| Bottom (tabs) | `ExplanationPanel`, `ClinicalMeasurements`, `WhatIfSimulator`, `ModelPerformance` |

## State

State lives in hooks composed by `Dashboard`; there is no global store.

| Hook | Holds |
|---|---|
| `useServiceData` | feature schema and model info, loaded once; loading / error / ready |
| `usePrediction` | the latest prediction and the inputs that produced it; out-of-order responses are dropped; a failure clears the previous result |
| `useExplanation` | SHAP for the current inputs; fetched only while shown, once per prediction, kept when hidden |
| `useAnatomy` | selected and hovered vessel, view mode, visible layers, camera reset |
| `useWhatIf` | what-if on/off, changed inputs, simulated prediction (debounced 250 ms) |

Selecting a vessel anywhere (3D mesh, vessel button, risk card) updates one piece of state, which
drives the 3D highlight, the selected-vessel panel and the explanation tab.

## API client

`src/lib/api.ts` is the only place that calls the network. Every response passes a shape guard
before it is used, so a malformed response becomes a typed error instead of a rendering failure.
All failures are an `ApiError` with a `kind` (`network`, `model_unavailable`, `invalid_input`,
`malformed_response`, `explanation_failed`, `server`) and a message that is safe to display.

Types in `src/types/` mirror the API schemas.

## 3D view

- `AnatomyViewer` owns the toolbar, vessel buttons, captions and fallbacks. It lazy-loads
  `AnatomyScene`, so three.js is downloaded only in the browser and only when needed.
- `AnatomyScene` contains the canvas, lights, camera rig and label projection.
- `GltfAnatomy` draws the licensed model. Nodes are matched to roles by name. Only the three
  modelled vessels (through enlarged invisible copies) and the heart respond to the pointer; the
  heart blocks picking a vessel through it.
- `ContextLayer` draws one optional layer (nervous system, skeleton, organs) from its own file,
  fetched when the layer is first switched on.
- `HeartModel`, `HumanBody`, `CoronaryArteries`, `LAD`, `LCX`, `RCA` are the generated schematic,
  used only if the licensed model fails to load.

Which asset is used, its node names, label anchors and credit lines come from
`src/lib/anatomyAsset.json`, written by the anatomy build.

**Colour rule.** `vesselVisualStates()` maps each vessel's probability to a band using the
categories from the API. Context structures are coloured from `src/lib/anatomyColors.ts`, one
style per tissue group, in one of two schemes: *realistic* (anatomical convention, the default)
or *muted* (greys and pastels outside the risk palette). Because realistic arteries are red, the
three modelled vessels are also marked by a glowing outline, which appears only once there is a
prediction; before that they look like any other coronary artery.

**Blood flow.** `flow.ts` adds travelling bright bands to vessel materials in the shader, as a
function of distance from where blood leaves or returns to the heart, so bands move outward in
arteries and inward in veins. It uses no patient data and is identical whatever the predictions
are. While it is on the canvas renders every frame; with it off, rendering is on demand.

**Performance.** With blood flow off the canvas renders on demand (interaction or prop change) rather than every frame,
pixel ratio is capped at 1.5, there are no textures or shadows, and the main model is about
150,000 triangles in a 3.7 MB file. Optional layers add their own cost only when enabled.

**Labels** are DOM elements positioned each rendered frame by projecting an anchor point on each
vessel, and faded when the anchor faces away from the camera.

## Charts

Hand-written SVG: `RiskGauge`, `SHAPBarChart`, `RocChart`, `ReliabilityChart`, `ConfusionMatrix`,
`ClassDistribution`. No chart library is used.

## Accessibility

- Every vessel is reachable by keyboard through the vessel buttons; the canvas is not required.
- Form fields have labels, errors are linked with `aria-describedby`, and tabs follow the ARIA pattern.
- Risk category is conveyed by text as well as colour; coloured text is avoided for contrast.
- A skip link jumps to the results; the disclaimer has `role="note"`.

## Styling

One stylesheet, `src/app/globals.css`, with CSS custom properties. Desktop-first with breakpoints
at 1280, 860 and 420 px. No component library.

## Tests

- **Component and unit (Vitest, Testing Library):** `src/tests/`. The WebGL scene cannot run in the
  test environment, so `sceneMock.tsx` stands in for it and exposes what the scene is told to draw.
- **End to end (Playwright):** `e2e/`, against the real API and models in a real browser, including
  a check that the canvas actually renders.
