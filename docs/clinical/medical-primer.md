# Background for non-clinical readers

A short orientation for developers and reviewers. It was written by engineers, has **not been
reviewed by a clinician**, and is not medical information to rely on.

## Coronary artery disease

The coronary arteries supply the heart muscle with blood. Coronary artery disease (CAD) is the
narrowing of these arteries, usually by atherosclerosis. A significant narrowing is called a stenosis.

## The three vessels in this project

| Abbreviation | Name | In BodyParts3D |
|---|---|---|
| LAD | Left anterior descending artery | "anterior interventricular branch of left coronary artery" |
| LCX | Left circumflex artery | "circumflex branch of left coronary artery" |
| RCA | Right coronary artery | "trunk of right coronary artery" and its branches |

The LAD and LCX both arise from the short left main coronary artery; the RCA arises separately.

## Where the outcome labels come from

In the dataset, the outcome columns (`Cath`, `LAD`, `LCX`, `RCA`) record what coronary angiography
found. Angiography is an invasive imaging procedure. The models try to predict those findings from
information gathered without it.

## The kinds of input

| Group | Examples | Source |
|---|---|---|
| Demographic | age, sex, weight, height | recorded |
| History and risk factors | diabetes, hypertension, smoking, family history | history |
| Examination | blood pressure, pulse rate, murmurs, edema | examination |
| Symptoms | typical or atypical chest pain, dyspnea | history |
| ECG | Q wave, ST elevation or depression, T inversion | electrocardiogram |
| Laboratory | fasting blood sugar, lipids, creatinine, blood counts | blood tests |
| Echocardiography | ejection fraction, wall motion abnormality, valve disease | ultrasound |

Meanings and units for each column are in the [data dictionary](../dataset/data-dictionary.md).

## Why none of this locates a lesion

The inputs describe the patient as a whole. None of them is a measurement of a particular artery.
A model can learn that certain patterns of inputs are statistically associated with a finding in a
particular vessel in this dataset, and that is all it learns. The cross-validated and holdout
results show how limited that association is for the LCX and RCA.

This is why the interface never says a vessel "is" narrowed, and why the 3D colouring is described
as a visualization of model output.
