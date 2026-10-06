# Demo script

About five minutes. Have the API and dashboard running (`.\scripts\dev.ps1` or `make dev`) and the
dashboard open at <http://localhost:3000> in a desktop browser.

Numbers are deliberately not written into this script: read them from the screen. They come from
the trained models and will change if the models are retrained.

## Before you start

- [ ] Header shows **Models ready**.
- [ ] The 3D heart has loaded (no "Loading anatomy…").
- [ ] Browser zoom at 100%, window at least 1300 px wide.

## 1. Frame it (30 seconds)

Point to the banner at the top.

> "This is a research and education prototype. It is not a medical device. Everything you will see
> is a model's prediction from clinical measurements, not a diagnosis."

## 2. First prediction (60 seconds)

In **Demo mode**, choose **Demo Profile A — Elevated model risk**.

> "This is a synthetic profile, not a real patient. The numbers that just appeared are the trained
> models' actual output for these inputs."

Point out, in order:

- the overall CAD probability and the line under it giving that model's holdout ROC-AUC and interval;
- the three vessel cards, each with its own model's evidence;
- the heart: only the LAD, LCX and RCA have changed colour.

> "The colour is the model's output mapped to four display bands. The bands are not clinical
> thresholds, and the caption says so."

## 3. The 3D view (60 seconds)

- Drag to rotate; scroll to zoom.
- Switch to **Torso context**, then tick **Nervous system** and **Skeleton**.

> "This is real reference anatomy from open datasets — one generic adult, not this patient. The
> colours follow anatomical convention: red for oxygenated blood, blue for deoxygenated, yellow
> nerves. The moving bands show the normal direction of blood flow. None of that is model output;
> only the three glowing coronary vessels are."

If you want model output to be the only colour on screen, untick **Realistic colours**.

Switch back to **Heart focus** and untick the layers.

## 4. Why this prediction? (60 seconds)

Click the **LAD** on the heart (or its button above the view).

- The **Selected vessel** panel shows the probability, the predicted class, the band and the top
  contributing inputs with this profile's values.
- The **Why this prediction?** tab below switches to the LAD model.

> "These bars show how the model used each input. Red pushed the prediction up, blue pushed it down.
> This is not cause and effect, and it says nothing about where a lesion might be."

Click the **RCA** tab.

> "Different vessel, different model, different explanation — and, as the card shows, a much weaker model."

## 5. What-if (45 seconds)

Open **What-if simulation** and choose **Turn on what-if mode**. Change **Typical chest pain** to **No**.

> "All four models re-ran. The table shows before and after, and the heart now shows the simulated
> output under an 'Exploratory model simulation' label. This is the model's sensitivity to its
> inputs. It is not a prediction of what would happen to a patient."

Choose **Turn off what-if mode**.

## 6. How good are the models? (45 seconds)

Open **Model performance**.

> "These are holdout results with 95% intervals, next to what you would get by always predicting the
> common class. CAD and LAD clearly beat that. LCX and RCA barely do. We show that rather than hide it."

Open the **RCA** tab under *Per-model detail* and point to the confusion matrix.

## 7. Contrast (20 seconds)

Choose **Demo Profile B — Lower model risk**. The vessels change colour again.

## 8. Close (20 seconds)

> "The point of this project is not the accuracy. It is showing a model's output next to anatomy in
> a way that is hard to misread: explained, with the model's limits on the same screen."

## If something goes wrong

| Symptom | What to do |
|---|---|
| "Service unreachable" | Start the API; choose **Try again** |
| "Models not available" | Run `.\scripts\train.ps1` (or `make train && make evaluate`), restart the API, reload |
| 3D view says not available | The browser has no WebGL; use the vessel buttons, everything else works |
| Schematic heart instead of real anatomy | The model file failed to load; reload the page |

## Questions you should expect

- **"Is this accurate enough to use?"** No. It is a single small dataset with no external validation,
  and two of the four models are weak.
- **"Does a red vessel mean it is blocked?"** No. It means that vessel's model output is in the
  highest display band for these inputs.
- **"Is the heart this patient's heart?"** No. It is generic reference anatomy.
- **"Could a feature be causing the risk?"** The explanation cannot tell you that. It shows what the
  model relied on.
