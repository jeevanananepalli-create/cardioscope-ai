# Safety and intended use

> This prototype is intended for research, education, and decision-support demonstration only. It
> is not a medical device and does not replace professional clinical evaluation, diagnostic imaging,
> or physician judgment.

## Intended use

- Teaching and demonstrating how tabular clinical data can be modelled, evaluated honestly and explained.
- Demonstrating a way to present model output alongside anatomy without overstating it.

## Not intended for

- Diagnosing, screening, triaging or monitoring any person.
- Deciding whether someone needs angiography or any other test or treatment.
- Use with real patient data.

## What the outputs are

| Output | What it is | What it is not |
|---|---|---|
| Probability | A model's estimate from the entered features | A measured likelihood for this person |
| "Model predicts CAD / stenosis" | Probability at or above the model's decision threshold | A diagnosis or a finding |
| Risk category (low … very high) | A display band for the prototype | A clinical risk class |
| Vessel colour in 3D | The band of that vessel's model output | Imaging, or the location of a lesion |
| Feature contribution | How the model used that input for this prediction | A cause, or evidence about anatomy |
| What-if result | How the model output changes when an input changes | The effect of changing anything in a patient |

## Wording rules followed in the interface and documents

- "Model prediction", never "diagnosis" or "confirmed".
- "Contributes toward a higher/lower predicted risk", never "causes", "proves" or "shows a blockage".
- Risk bands are always accompanied by the statement that they are not clinically validated.
- The what-if tool is always labelled "Exploratory model simulation".
- The 3D view always states that the anatomy is generic and that colour is model output.

Automated tests check for the disclaimer and for banned phrases in the rendered interface and in
the explanation text.

## Known limitations of the evidence

- **Data:** 303 patients from one centre. No external validation. The population, measurement
  practices and referral pattern of that centre are built into the models.
- **Selection of patients:** everyone in the dataset was referred for angiography, so the models
  were never exposed to people for whom angiography was not considered.
- **Performance:** two of the four models (LCX, RCA) are weak; see
  [model results](../evaluation/model-results.md). Intervals are wide for all four.
- **Probabilities:** calibration was assessed on the same small dataset.
- **Labels:** "stenosis" follows the dataset's own definition; one record is internally inconsistent.
- **Extrapolation:** inputs outside the training range are flagged, but the models still answer.

## Data handling

- Nothing entered is stored. Requests are held in memory for the duration of the call.
- Logs contain method, path, status and latency only.
- There is no authentication. Run it locally; do not expose it on a network.
- The demo profiles are synthetic and labelled as such.

## If this were ever taken further

It would need, at minimum: clinical leadership, prospective and external validation, a defined
intended use and population, bias and subgroup analysis, regulatory assessment as medical device
software, security and privacy engineering, and usability testing with clinicians. None of that has
been done.
