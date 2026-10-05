"""Export context anatomy from the Z-Anatomy .blend file (run inside Blender).

Writes, next to the .blend file:
  z_anatomy_export.npz    world-space triangle meshes (metres, z up) for the groups
                          cns, peripheral_nerves, skeleton, organs
  z_anatomy_export.json   which objects went into each group, which were left out and
                          why, and bounds of reference bones used to align Z-Anatomy
                          with BodyParts3D

Selection rules
  - Objects come from Z-Anatomy's numbered top-level collections.
  - Names ending ".j", ".i" or ".g", flat objects and objects placed beside the body are label lines and region markers, not
    anatomy, and are skipped.
  - Nervous system: everything in "7: Nervous system & Sense organs" except the sense
    organs (they include inner-ear models under a non-commercial licence) and the
    meninges (they would hide the brain). Nerve curves and nerve-named meshes form
    "peripheral_nerves"; the rest (brain, brainstem, cerebellum, spinal cord) forms "cns".
  - Skeleton: "1: Skeletal system".
  - Organs: "8: Visceral systems", except the kidneys (non-commercial licence) and the
    pleura and peritoneal sheets (they would hide the organs).

Nerve curves in the file are 0.5 mm in radius, too thin to see at body scale, so they
are drawn at a minimum radius of MIN_NERVE_RADIUS_M. Nerve paths are unchanged; their
thickness is not to scale.

Usage:
    blender --background --factory-startup --disable-autoexec <Startup.blend> \
        --python scripts/anatomy/export_z_anatomy.py
"""

import json
import os
import re

import bpy
import numpy as np
from mathutils import Vector

MIN_NERVE_RADIUS_M = 0.0011
HELPER_SUFFIX = re.compile(r"\.(j|i|g)$")
EYE_OR_EAR = re.compile(
    r"lens|ciliary|eyeball|cornea|iris|retina|sclera|vitreous|zonular|pupil|lacrimal|cochlea|tympan|semicircular|vestibule",
    re.I,
)
# Anything further than this from the midline is a helper placed beside the body.
MAX_ABS_X_M = 0.6
PERIPHERAL = re.compile(r"nerve|plexus|gangli|sympathetic|trunk|ramus|rami|\broot\b|cauda equina|branch", re.I)
MENINGES = re.compile(r"dura|arachnoid|pia mater|mening|falx|tentorium|diaphragma sellae", re.I)
NON_COMMERCIAL = re.compile(r"kidney|renal (pelvis|calyx|pyramid|cortex|medulla)", re.I)
ORGAN_COVERS = re.compile(r"pleura|periton|mesentery|omentum|meso|cavity", re.I)
REFERENCE_BONES = ("Body of sternum", "Manubrium of sternum", "Vertebra T6", "Vertebra L3", "Sacrum")

OUTPUT_DIR = os.path.dirname(bpy.data.filepath)


def collection(name):
    found = next((c for c in bpy.data.collections if c.name == name), None)
    if found is None:
        raise RuntimeError(f"Collection {name!r} not found in the Z-Anatomy file")
    return found


def geometry(name):
    return [o for o in collection(name).all_objects if o.type in ("MESH", "CURVE")]


def world_bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    return low, high


def is_flat(obj):
    low, high = world_bounds(obj)
    return obj.type == "MESH" and min(high[i] - low[i] for i in range(3)) < 0.0002


def helper_reason(obj):
    if HELPER_SUFFIX.search(obj.name):
        return "label or region marker"
    low, high = world_bounds(obj)
    if max(abs(low[0]), abs(high[0])) > MAX_ABS_X_M:
        return "helper placed beside the body"
    if is_flat(obj):
        return "flat helper object"
    return None


# --- choose objects -----------------------------------------------------------------------
groups = {"cns": {}, "peripheral_nerves": {}, "skeleton": {}, "organs": {}}
skipped = {}
sense_organs = {o.name for o in geometry("Sense organs")}

for obj in geometry("7: Nervous system & Sense organs"):
    reason = helper_reason(obj)
    if obj.name in sense_organs or EYE_OR_EAR.search(obj.name):
        reason = "sense organ (not exported)"
    elif reason is None and MENINGES.search(obj.name):
        reason = "meninges (would hide the brain)"
    if reason:
        skipped[obj.name] = reason
    elif obj.type == "CURVE" or PERIPHERAL.search(obj.name):
        groups["peripheral_nerves"][obj.name] = obj
    else:
        groups["cns"][obj.name] = obj

for obj in geometry("1: Skeletal system"):
    reason = helper_reason(obj)
    if reason:
        skipped[obj.name] = reason
    else:
        groups["skeleton"][obj.name] = obj

for obj in geometry("8: Visceral systems"):
    reason = helper_reason(obj)
    if reason is None and NON_COMMERCIAL.search(obj.name):
        reason = "kidney model is under a non-commercial licence"
    elif reason is None and ORGAN_COVERS.search(obj.name):
        reason = "covering sheet or cavity (would hide the organs)"
    if reason:
        skipped[obj.name] = reason
    else:
        groups["organs"][obj.name] = obj

# --- make them evaluable ------------------------------------------------------------------
staging = bpy.data.collections.new("cardioscope_export")
bpy.context.scene.collection.children.link(staging)
for members in groups.values():
    for obj in members.values():
        if obj.name not in staging.objects:
            staging.objects.link(obj)
        obj.hide_viewport = False
        obj.hide_render = False
        obj.hide_set(False)
        if obj.type == "CURVE" and obj.data.bevel_object is None:
            data = obj.data
            data.bevel_depth = max(data.bevel_depth, MIN_NERVE_RADIUS_M)
            data.bevel_resolution = 1
            data.resolution_u = min(data.resolution_u, 6)
            data.use_fill_caps = True

bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()


def triangles(obj):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=depsgraph)
    if mesh is None or len(mesh.vertices) == 0:
        return None
    mesh.calc_loop_triangles()
    vertices = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    mesh.vertices.foreach_get("co", vertices)
    faces = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int32)
    mesh.loop_triangles.foreach_get("vertices", faces)
    matrix = np.array(evaluated.matrix_world, dtype=np.float64)
    world = vertices.reshape(-1, 3).astype(np.float64) @ matrix[:3, :3].T + matrix[:3, 3]
    bpy.data.meshes.remove(mesh)
    return world.astype(np.float32), faces.reshape(-1, 3)


arrays = {}
for label, members in groups.items():
    all_vertices, all_faces, offset = [], [], 0
    for name in sorted(members):
        result = triangles(members[name])
        if result is None or len(result[1]) == 0:
            skipped[name] = "no geometry after evaluation"
            continue
        vertices, faces = result
        all_vertices.append(vertices)
        all_faces.append(faces + offset)
        offset += len(vertices)
    for name in [n for n in members if skipped.get(n) == "no geometry after evaluation"]:
        members.pop(name)
    arrays[f"{label}_vertices"] = np.concatenate(all_vertices)
    arrays[f"{label}_faces"] = np.concatenate(all_faces)
    low, high = arrays[f"{label}_vertices"].min(axis=0), arrays[f"{label}_vertices"].max(axis=0)
    print(f"{label}: {len(members)} objects, {len(arrays[f'{label}_faces'])} triangles, bounds {low.round(3)} {high.round(3)}")

np.savez_compressed(os.path.join(OUTPUT_DIR, "z_anatomy_export.npz"), **arrays)

reference = {}
for name in REFERENCE_BONES:
    obj = bpy.data.objects.get(name)
    if obj is not None and obj.type == "MESH":
        low, high = world_bounds(obj)
        reference[name] = {"min": low, "max": high}

with open(os.path.join(OUTPUT_DIR, "z_anatomy_export.json"), "w", encoding="utf-8") as handle:
    json.dump(
        {
            "source": "Z-Anatomy Startup.blend",
            "units": "metres, z up",
            "min_nerve_radius_m": MIN_NERVE_RADIUS_M,
            "groups": {label: sorted(members) for label, members in groups.items()},
            "skipped": dict(sorted(skipped.items())),
            "reference_bones": reference,
        },
        handle,
        indent=1,
    )
print("wrote z_anatomy_export.npz and z_anatomy_export.json")
