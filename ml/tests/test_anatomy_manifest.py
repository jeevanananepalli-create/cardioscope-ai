"""The anatomy manifest must map the modelled vessels to the right BodyParts3D parts."""

import json

from ml.src.paths import REPO_ROOT

MANIFEST = json.loads((REPO_ROOT / "assets" / "anatomy" / "bodyparts3d_manifest.json").read_text(encoding="utf-8"))


def _vessel_nodes():
    return {node["vessel"]: node for node in MANIFEST["nodes"].values() if "vessel" in node}


def test_each_modelled_vessel_has_exactly_one_node():
    assert set(_vessel_nodes()) == {"LAD", "LCX", "RCA"}


def test_vessel_parts_are_the_matching_coronary_branches():
    nodes = _vessel_nodes()
    lad, lcx, rca = (" | ".join(nodes[v]["parts"].values()) for v in ("LAD", "LCX", "RCA"))
    assert "anterior interventricular branch of left coronary artery" in lad
    assert "circumflex branch of left coronary artery" in lcx
    assert "trunk of right coronary artery" in rca
    assert "right coronary" not in lad and "right coronary" not in lcx
    assert "left coronary" not in rca


def test_no_part_is_used_twice():
    parts = [part for node in MANIFEST["nodes"].values() for part in node["parts"]]
    assert len(parts) == len(set(parts))


def test_licence_and_attribution_are_recorded():
    source = MANIFEST["source"]
    assert source["license"] == "Creative Commons Attribution-Share Alike 2.1 Japan"
    assert "The Database Center for Life Science" in source["attribution"]
