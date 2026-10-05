# Preprocessing

Column-by-column facts are in the generated [data dictionary](data-dictionary.md). This document
explains how raw values become model inputs. The code is `ml/src/data/preprocessing.py`; the
configuration is `ml/configs/features.yaml`.

## One pipeline, used everywhere

```
raw frame ──► build_feature_matrix ──► [ canonicalize ──► encode ──► classifier ]
              (whitelist only)           └────────── saved with the model ──────┘
```

`build_feature_matrix` selects the whitelisted columns. Everything after it is a single
scikit-learn pipeline that is fitted inside each training fold and serialised with the model, so
training, cross-validation and the API all run the same code with the same fitted statistics.

## Feature kinds

| Kind | Examples | Canonical form | Encoding |
|---|---|---|---|
| numeric (21) | Age, BP, LDL, EF-TTE | float | median imputation; standardised for logistic regression and SVM |
| binary (28) | DM, HTN, Typical Chest Pain | 0 / 1 | mode imputation |
| ordinal (3) | Function Class, Region RWMA, VHD | level index (0, 1, 2 …) | mode imputation; standardised where scaling is on |
| categorical (2) | Sex, BBB | category string | mode imputation, one-hot with a fixed category list |

Tree models are not scaled. One-hot columns use the category list from the schema, so every fold
produces the same columns; a two-level category becomes one column.

## Canonicalisation

The raw file is inconsistent in representation, not in content:

- yes/no flags appear as `0`/`1` in some columns and `N`/`Y` in others;
- `Sex` uses `Male` and `Fmale`;
- `VHD` mixes `N`, `mild`, `Moderate`, `Severe`.

`SchemaCanonicalizer` maps these known variants to one form (`Fmale` → `Female`, `Y` → 1,
`mild` → `Mild`), ignoring case and surrounding spaces. A value that is not a recognised
representation raises an error. Nothing is guessed or clamped.

## Missing values

The supplied dataset has no missing cells. Imputers are still part of the pipeline so that it
cannot fail on a missing value, but the models were never trained on imputed inputs. For that
reason the API requires every input and does not impute on a user's behalf.

## Excluded and derived features

- **Excluded:** `Exertional CP` is `N` for every record and carries no information.
- **Derived:** in this dataset `BMI` equals weight ÷ height² exactly, and `Obesity` is `Y` exactly
  when BMI ≥ 25 (verified against all 303 records by `ml/tests/test_feature_engineering.py`).
  Both remain model inputs, but at inference they are computed from the entered weight and height
  (`ml/src/features/feature_engineering.py`) so they cannot contradict them.
- **Outcomes:** `LAD`, `LCX`, `RCA` and `Cath` are never inputs. See README, "Leakage prevention".

## Input limits

Each numeric feature has `input_limits` in `features.yaml`, for example age 18–110. These are
generous plausibility bounds chosen for this prototype to catch typing errors. They are not
clinical reference ranges and play no part in training. Separately, a value outside the range seen
in training is accepted with a warning that the models are extrapolating; the what-if sliders are
restricted to the training range.

## No preprocessing leakage

Imputation values, scaling statistics and encoders are fitted on the training part of each fold
and on the development set for the final models. `ml/tests/test_preprocessing.py` checks that the
fitted statistics equal those of the training rows and differ from those of the full data.

## Units and labels

The data file carries no units. Labels and units in `features.yaml` follow the dataset's published
feature description and are shown for readability only. They have not been independently verified.
