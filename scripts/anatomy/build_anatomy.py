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

    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    GLB_PATH.write_bytes(scene.export(file_type="glb"))
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
        "nodes": meta_nodes,
    }
    META_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{total_faces} faces, {GLB_PATH.stat().st_size / 1e6:.2f} MB -> {GLB_PATH.relative_to(REPO_ROOT).as_posix()}")
    print(f"wrote {META_PATH.relative_to(REPO_ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
