# Anatomy asset attribution

## BodyParts3D

The 3D anatomy shown in CardioScope AI
(`apps/web/public/models/anatomy/cardioscope-anatomy.glb`) is derived from:

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan

- Licence: Creative Commons Attribution-Share Alike 2.1 Japan — https://creativecommons.org/licenses/by-sa/2.1/jp/
- Original project: BodyParts3D / Anatomography, Database Center for Life Science (DBCLS)
- Files obtained from the STL mirror at https://github.com/Kevin-Mattheus-Moerman/BodyParts3D

### What was changed

`scripts/anatomy/build_anatomy.py` converts the meshes for use in a browser. It:

- selects the parts listed in `bodyparts3d_manifest.json` and merges them into named groups;
- moves and rescales them (millimetres to 10 cm units, centred on the heart, y up);
- reduces the triangle count;
- adds an enlarged, invisible copy of each of the three modelled vessels, used only so the
  thin vessels can be pointed at.

Shapes are not otherwise edited.

### Share-alike

Because it is a derivative work, **the GLB file and `apps/web/src/lib/anatomyAsset.json` are
distributed under the same CC BY-SA 2.1 Japan licence**, with the attribution above. This
applies to those asset files, not to the application's source code.

### What it is, and is not

- It is generic reference anatomy of one adult male. It is not derived from, and does not
  represent, any patient entered into the application.
- The parts used for the modelled vessels are, by their BodyParts3D names:
  - **LAD** — anterior interventricular branch of left coronary artery, and the
    interventricular septal branches of the left coronary artery;
  - **LCX** — circumflex branch of left coronary artery;
  - **RCA** — trunk of right coronary artery, with its marginal, posterior interventricular,
    right posterolateral and interventricular septal branches.
- BodyParts3D has no diagonal or obtuse marginal branches, no peripheral nerves and no
  separate spinal cord mesh, so none are shown.
- Colour on LAD, LCX and RCA is a visualization of model output. It is not imaging and does
  not locate a lesion.

## Rebuilding

```
python -m pip install trimesh fast-simplification
python scripts/anatomy/fetch_bodyparts3d.py    # downloads ~110 MB to assets/anatomy/raw/ (git-ignored)
python scripts/anatomy/build_anatomy.py
```
