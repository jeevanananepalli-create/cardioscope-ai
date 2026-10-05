# Release checklist

Run through this before a demonstration or before sharing the repository.

## Data and models

- [ ] Dataset is at `ml/data/raw/extention of Z-Alizadeh sani dataset.xlsx` and is **not** committed.
- [ ] `python -m ml.scripts.prepare_data` reports no validation errors.
- [ ] `python -m ml.scripts.train_all` then `python -m ml.scripts.evaluate_all` completed.
- [ ] `python -m ml.scripts.generate_report` was run, so the documents match the current models.
- [ ] `ml/models/` is not committed.

## Tests

- [ ] `python -m pytest` — all pass, none skipped locally.
- [ ] `cd apps/web && npm run typecheck && npm test` — all pass.
- [ ] `cd apps/web && npm run test:e2e` — all pass.
- [ ] `cd apps/web && npm run build` — succeeds.

## Leakage (critical)

- [ ] `ml/tests/test_target_leakage.py` passes.
- [ ] No feature in `ml/configs/features.yaml` is `LAD`, `LCX`, `RCA` or `Cath`.

## Honesty of what is shown

- [ ] Every number in the README, summary and pitch sits inside a generated block or is a count
      from the data dictionary.
- [ ] The safety disclaimer is visible on load and while scrolling.
- [ ] No text says "diagnosis", "confirmed", "proves", "causes" or "blocked" about a prediction.
- [ ] The 3D caption states the anatomy is generic and that colour is model output.
- [ ] What-if mode is labelled "Exploratory model simulation".
- [ ] Demo profiles are labelled synthetic.

## Licences and attribution

- [ ] Anatomy credits appear under the 3D view and in `assets/anatomy/ATTRIBUTION.md`.
- [ ] `THIRD_PARTY_NOTICES.md` is current.
- [ ] A licence for the source code has been chosen (none has been yet).
- [ ] Dataset citation and licence re-checked on the UCI page.

## Security and privacy

- [ ] No `.env` file or secret is committed.
- [ ] No real patient data has been entered or saved anywhere.
- [ ] The application is not exposed on a public network (there is no authentication).

## Not yet done (carry forward)

- [ ] Docker images built and run at least once.
- [ ] Units, labels and input limits reviewed by a clinician.
- [ ] Frame rate checked on a machine without a dedicated GPU.
