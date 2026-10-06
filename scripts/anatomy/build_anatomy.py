"""Build the browser anatomy asset from the downloaded BodyParts3D meshes.

Reads   assets/anatomy/bodyparts3d_manifest.json and assets/anatomy/raw/bodyparts3d/*.stl
Writes  apps/web/public/models/anatomy/cardioscope-anatomy.glb   (simplified meshes, one node per group)
        apps/web/src/lib/anatomyAsset.json                       (node names, bounds, label anchors, attribution)

Geometry is only repositioned, rescaled and simplified (fewer triangles); shapes
are not edited. Coordinates are converted from BodyParts3D (millimetres, z up,
front = -y) to the viewer's (1 unit = 10 cm, y up, front = +z, patient's left = +x)
and centred on the heart.

The output is a derivative of BodyParts3D and stays under its licence:
BodyParts3D, (c) The Database Center for Life Science, CC Attribution-Share Alike 2.1 Japan.

Optional context layers (nervous system, skeleton, organs) come from Z-Anatomy, if
assets/anatomy/raw/z-anatomy/Z-Anatomy/z_anatomy_export.npz exists (written by
scripts/anatomy/export_z_anatomy.py inside Blender). Each layer becomes its own GLB so
the browser only downloads a layer when it is switched on. Those files are derivatives
of Z-Anatomy (CC BY-SA 4.0), which is itself derived from BodyParts3D.

Usage (from the repository root):
    python scripts/anatomy/fetch_bodyparts3d.py
    python scripts/anatomy/build_anatomy.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import fast_simplification
import numpy as np
import trimesh

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPO_ROOT / "assets" / "anatomy" / "bodyparts3d_manifest.json"
RAW_DIR = REPO_ROOT / "assets" / "anatomy" / "raw" / "bodyparts3d"
GLB_PATH = REPO_ROOT / "apps" / "web" / "public" / "models" / "anatomy" / "cardioscope-anatomy.glb"
META_PATH = REPO_ROOT / "apps" / "web" / "src" / "lib" / "anatomyAsset.json"
PUBLIC_URL = "/models/anatomy/cardioscope-anatomy.glb"

UNITS_PER_MM = 0.01
# Vessels are thin; an inflated, invisible copy makes them easy to point at.
HIT_INFLATE_UNITS = 0.035
HIT_TARGET_FACES = 1200

Z_ANATOMY_EXPORT = REPO_ROOT / "assets" / "anatomy" / "raw" / "z-anatomy" / "Z-Anatomy" / "z_anatomy_export.npz"
Z_ANATOMY_ATTRIBUTION = (
    "Z-Anatomy, the libre 3D atlas of anatomy, CC BY-SA 4.0, derived from BodyParts3D "
    "(© The Database Center for Life Science, CC BY-SA 2.1 Japan); cranial nerves adapted from "
    "“Cranial Nerves and Foramina” by University of Dundee, CAHID, CC BY 4.0"
)
Z_ANATOMY_LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"
# Z-Anatomy repositioned and re-modelled BodyParts3D, so the two do not share coordinates.
# This offset (Z-Anatomy minus BodyParts3D, in mm) is the one that best matches the heart
# and five reference bones; they agree to within a few millimetres, not exactly.
Z_ANATOMY_OFFSET_MM = np.array([1.0, 97.5, 54.3])
# layer -> (file stem, {node name: (export group, target faces)})
# Each node is one tissue group from the export, so the viewer can colour it separately.
Z_ANATOMY_LAYERS = {
    "nerves": (
        "layer-nervous-system",
        {"cns_brain": 80000, "cns_spinal": 10000, "peripheral_nerves": 90000},
    ),
    "skeleton": (
        "layer-skeleton",
        {"skeleton_bone": 62000, "skeleton_cartilage": 8000, "skeleton_teeth": 3000},
    ),
    "organs": (
        "layer-organs",
        {
            "organs_lungs": 9000,
            "organs_airways": 5000,
            "organs_liver": 6000,
            "organs_biliary": 1500,
            "organs_digestive": 9000,
            "organs_pancreas": 1500,
            "organs_glands": 3000,
            "organs_urogenital": 3000,
            "organs_other": 2000,
        },
    ),
}


def load_group(parts: dict[str, str]) -> trimesh.Trimesh:
    meshes = []
    for part in parts:
        path = RAW_DIR / f"{part}.stl"
        if not path.is_file():
            raise FileNotFoundError(
                f"{path.relative_to(REPO_ROOT).as_posix()} is missing. "
                "Run `python scripts/anatomy/fetch_bodyparts3d.py` first."
            )
        meshes.append(trimesh.load(path, force="mesh", process=True))
    return trimesh.util.concatenate(meshes) if len(meshes) > 1 else meshes[0]


def to_viewer_space(vertices: np.ndarray, origin_mm: np.ndarray) -> np.ndarray:
    centred = (vertices - origin_mm) * UNITS_PER_MM
    return np.column_stack([centred[:, 0], centred[:, 2], -centred[:, 1]])


def simplify(mesh: trimesh.Trimesh, target_faces: int) -> trimesh.Trimesh:
    mesh.merge_vertices()
    if len(mesh.faces) > target_faces:
        reduction = 1.0 - target_faces / len(mesh.faces)
        vertices, faces = fast_simplification.simplify(
            np.asarray(mesh.vertices, dtype=np.float32), np.asarray(mesh.faces), target_reduction=reduction
        )
        mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)
    mesh.visual = trimesh.visual.ColorVisuals(mesh)
    _ = mesh.vertex_normals  # computed so that they are written to the file
    return mesh


def bounds_of(mesh: trimesh.Trimesh) -> dict[str, list[float]]:
    low, high = mesh.bounds
    return {
        "min": [round(float(v), 4) for v in low],
        "max": [round(float(v), 4) for v in high],
        "center": [round(float(v), 4) for v in (low + high) / 2],
    }


def label_anchor(vessel: str, mesh: trimesh.Trimesh) -> list[float]:
    """A point on the vessel that is visible from the front, used to pin its label."""
    vertices = np.asarray(mesh.vertices)
    if vessel == "LCX":
        index = int(np.argmax(vertices[:, 0]))  # furthest toward the patient's left
    elif vessel == "RCA":
        index = int(np.argmin(vertices[:, 0]))  # furthest toward the patient's right
    else:
        index = int(np.argmin(np.linalg.norm(vertices - vertices.mean(axis=0), axis=1)))
    return [round(float(v), 4) for v in vertices[index]]


def build_context_layers(origin_mm: np.ndarray) -> dict[str, dict]:
    """One GLB per optional layer from the Z-Anatomy export; empty if it has not been run."""
    if not Z_ANATOMY_EXPORT.is_file():
        print("Z-Anatomy export not found: nervous system, skeleton and organ layers are skipped.")
        return {}
    export = np.load(Z_ANATOMY_EXPORT)
    layers: dict[str, dict] = {}
    for layer, (stem, nodes) in Z_ANATOMY_LAYERS.items():
        scene = trimesh.Scene()
        described = {}
        for node_name, target_faces in nodes.items():
            group = node_name
            if f"{group}_vertices" not in export.files:
                continue
            vertices_mm = export[f"{group}_vertices"].astype(np.float64) * 1000.0 - Z_ANATOMY_OFFSET_MM
            mesh = trimesh.Trimesh(
                vertices=to_viewer_space(vertices_mm, origin_mm), faces=export[f"{group}_faces"], process=True
            )
            source_faces = len(mesh.faces)
            mesh = simplify(mesh, target_faces)
            scene.add_geometry(mesh, node_name=node_name, geom_name=node_name)
            described[node_name] = {
                "faces": int(len(mesh.faces)),
                "source_faces": int(source_faces),
                "bounds": bounds_of(mesh),
            }
            print(f"{layer}/{node_name:18s} {source_faces:>8d} -> {len(mesh.faces):>6d} faces")
        path = GLB_PATH.with_name(f"{stem}.glb")
        path.write_bytes(scene.export(file_type="glb"))
        layers[layer] = {
            "url": f"/models/anatomy/{stem}.glb",
            "file_bytes": path.stat().st_size,
            "nodes": described,
            "source_name": "Z-Anatomy",
            "attribution": Z_ANATOMY_ATTRIBUTION,
            "license_url": Z_ANATOMY_LICENSE_URL,
        }
        print(f"   {path.stat().st_size / 1e6:.2f} MB -> {path.relative_to(REPO_ROOT).as_posix()}")
    return layers


def main() -> int:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    nodes = manifest["nodes"]
    try:
        raw = {name: load_group(node["parts"]) for name, node in nodes.items()}
    except FileNotFoundError as exc:
        print(f"SETUP ERROR\n{exc}", file=sys.stderr)
        return 2

    origin_mm = np.asarray(raw["heart"].vertices).mean(axis=0)
    scene = trimesh.Scene()
    meta_nodes: dict[str, dict] = {}
    vessels: dict[str, dict] = {}
    total_faces = 0
    for name, node in nodes.items():
        source = raw[name]
        source_faces = len(source.faces)
        source.vertices = to_viewer_space(np.asarray(source.vertices), origin_mm)
        mesh = simplify(source, int(node["target_faces"]))
        scene.add_geometry(mesh, node_name=name, geom_name=name)
        total_faces += len(mesh.faces)
        meta_nodes[name] = {
            "layer": node["layer"],
            "faces": int(len(mesh.faces)),
            "source_faces": int(source_faces),
            "bounds": bounds_of(mesh),
            "parts": node["parts"],
        }
        print(f"{name:20s} {source_faces:>8d} -> {len(mesh.faces):>6d} faces")
        vessel = node.get("vessel")
        if vessel:
            inflated = mesh.copy()
            inflated.vertices = inflated.vertices + inflated.vertex_normals * HIT_INFLATE_UNITS
            hit = simplify(inflated, HIT_TARGET_FACES)
            hit_name = f"hit_{vessel}"
            scene.add_geometry(hit, node_name=hit_name, geom_name=hit_name)
            vessels[vessel] = {"node": name, "hit_node": hit_name, "label_anchor": label_anchor(vessel, mesh)}

    # Reference points for the illustrative blood-flow animation, in viewer coordinates.
    flow = {}
    for name, reference in manifest.get("flow_references", {}).items():
        part = trimesh.load(RAW_DIR / f"{reference['part']}.stl", force="mesh", process=True)
        points = to_viewer_space(np.asarray(part.vertices), origin_mm)
        lowest = points[points[:, 1] <= np.percentile(points[:, 1], 5)]
        flow[name] = {"point": [round(float(v), 4) for v in lowest.mean(axis=0)], "note": reference["note"]}

    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    GLB_PATH.write_bytes(scene.export(file_type="glb"))
    layers = build_context_layers(origin_mm)
    meta = {
        "_generated_by": "scripts/anatomy/build_anatomy.py (do not edit by hand)",
        "url": PUBLIC_URL,
        "attribution": manifest["source"]["attribution"],
        "license": manifest["source"]["license"],
        "license_url": manifest["source"]["license_url"],
        "source_name": manifest["source"]["name"],
        "units": "1 unit = 10 cm; y up; +z is the front of the body; +x is the patient's left; origin at the heart",
        "limitations": manifest["notes"],
        "total_faces": int(total_faces),
        "file_bytes": GLB_PATH.stat().st_size,
        "vessels": vessels,
        "flow": flow,
        "nodes": meta_nodes,
        "layers": layers,
    }
    META_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{total_faces} faces, {GLB_PATH.stat().st_size / 1e6:.2f} MB -> {GLB_PATH.relative_to(REPO_ROOT).as_posix()}")
    print(f"wrote {META_PATH.relative_to(REPO_ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
