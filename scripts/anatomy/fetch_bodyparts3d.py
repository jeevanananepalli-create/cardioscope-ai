"""Download the BodyParts3D meshes listed in assets/anatomy/bodyparts3d_manifest.json.

Files are saved to assets/anatomy/raw/bodyparts3d/ (git-ignored). Existing files
are kept, so the script can be re-run to resume.

BodyParts3D, (c) The Database Center for Life Science, licensed under
CC Attribution-Share Alike 2.1 Japan.

Usage (from the repository root):
    python scripts/anatomy/fetch_bodyparts3d.py
"""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST = REPO_ROOT / "assets" / "anatomy" / "bodyparts3d_manifest.json"
RAW_DIR = REPO_ROOT / "assets" / "anatomy" / "raw" / "bodyparts3d"


def main() -> int:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    base_url = manifest["source"]["raw_base_url"]
    parts = {part for node in manifest["nodes"].values() for part in node["parts"]}
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    for index, part in enumerate(sorted(parts), start=1):
        target = RAW_DIR / f"{part}.stl"
        if target.is_file() and target.stat().st_size > 84:
            total += target.stat().st_size
            continue
        url = f"{base_url}{part}.stl"
        temporary = target.with_suffix(".part")
        try:
            with urllib.request.urlopen(url, timeout=120) as response, open(temporary, "wb") as handle:
                while chunk := response.read(1 << 20):
                    handle.write(chunk)
        except Exception as exc:  # network or HTTP error
            temporary.unlink(missing_ok=True)
            print(f"FAILED {part}: {exc}", file=sys.stderr)
            return 1
        temporary.replace(target)
        total += target.stat().st_size
        print(f"[{index}/{len(parts)}] {part}.stl {target.stat().st_size / 1e6:.2f} MB")
    print(f"{len(parts)} files, {total / 1e6:.1f} MB in {RAW_DIR.relative_to(REPO_ROOT).as_posix()}/")
    print(manifest["source"]["attribution"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
