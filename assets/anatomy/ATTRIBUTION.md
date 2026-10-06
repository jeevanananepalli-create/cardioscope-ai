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

## Z-Anatomy (nervous system, skeleton and organ layers)

The optional layers `layer-nervous-system.glb`, `layer-skeleton.glb` and `layer-organs.glb`
(in `apps/web/public/models/anatomy/`) are derived from:

> Z-Anatomy — The libre 3D atlas of anatomy — CC-BY-SA 4.0

which is itself derived from:

> BodyParts3D — The Database Center for Life Science — CC-BY-SA 2.1 Japan

and whose cranial nerves are adapted from:

> Cranial Nerves and Foramina — by University of Dundee, CAHID — CC-BY 4.0

- Licence: Creative Commons Attribution-ShareAlike 4.0 International — https://creativecommons.org/licenses/by-sa/4.0/
- Source: https://github.com/Z-Anatomy/Models-of-human-anatomy (`Z-Anatomy.zip`, `Startup.blend`)
- These three GLB files are distributed under CC BY-SA 4.0 with the attribution above.

### What was taken, and what was left out

`scripts/anatomy/export_z_anatomy.py` (run inside Blender) selects:

- **Nervous system:** brain, brainstem, cerebellum and spinal cord, plus the cranial and
  spinal nerves, plexuses, sympathetic trunks and ganglia.
- **Skeleton:** the bones and cartilages of the skeletal system.
- **Organs:** the visceral systems (lungs and airways, liver, digestive tract, glands and so on).

Deliberately **not** exported:

- the inner ear and other sense organs, and the kidneys: Z-Anatomy lists those models under
  **non-commercial** licences (CC-BY-NC-SA and CC-BY-NC), which this project does not use;
- the meninges, pleura and peritoneal sheets, which would hide what they cover;
- Z-Anatomy's label lines, region markers and helper objects.

### What was changed

- Positions are shifted and rescaled into the viewer's coordinates, and triangle counts reduced.
- **Nerve thickness is not to scale.** Nerve paths in Z-Anatomy are 0.5 mm in radius, which is
  invisible at body scale, so they are drawn at a minimum radius of 1.1 mm. Their paths are
  unchanged.
- **Alignment with BodyParts3D is approximate.** Z-Anatomy repositioned and re-modelled the
  BodyParts3D meshes, so the two sets do not share exact coordinates. They are aligned with one
  translation that matches the heart and five reference bones to within a few millimetres.

- Structures are grouped by tissue (for example liver, lungs, bone, cartilage, brain, spinal cord)
  so the viewer can colour each group. **Colours are applied by the application**, following
  common anatomical-illustration conventions; they are not part of the source data.
- The **blood-flow animation** is added by the application. It is a visual effect showing the
  normal direction of circulation, not data from either source and not a simulation.

These layers are anatomical context only. No model in this project predicts anything about
nerves, bones or organs, and none of these layers is ever coloured by model output.

### Rebuilding the layers

Blender is needed for this step only (any recent version; 4.5 LTS was used).

```
# 1. Download Z-Anatomy.zip from the repository above and extract Startup.blend to
#    assets/anatomy/raw/z-anatomy/Z-Anatomy/
# 2. Export (scripts embedded in the .blend are not run):
blender --background --factory-startup --disable-autoexec \
    assets/anatomy/raw/z-anatomy/Z-Anatomy/Startup.blend \
    --python scripts/anatomy/export_z_anatomy.py
# 3. Build all GLB files:
python scripts/anatomy/build_anatomy.py
```

If the Z-Anatomy export is absent, `build_anatomy.py` builds the BodyParts3D asset only and the
three layer checkboxes are shown as not available.
