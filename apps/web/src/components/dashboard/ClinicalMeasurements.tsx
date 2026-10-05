import { levelLabel } from "@/components/dashboard/PatientForm";
import type { FeatureDescription, FeatureSchema, PatientFeatures } from "@/types/patient";

interface ClinicalMeasurementsProps {
  schema: FeatureSchema;
  /** The inputs that produced the current prediction. */
  features: PatientFeatures;
  /** BMI and Obesity as derived by the API. */
  derived: Record<string, number>;
  /** Feature names to show first / emphasise (e.g. top contributors). */
  highlight?: string[];
}

function display(feature: FeatureDescription, value: number | string | undefined): string {
  if (value === undefined) return "—";
  if (feature.kind === "numeric") {
    const number = Number(value);
    return Number.isInteger(number) ? String(number) : number.toFixed(1);
  }
  return levelLabel(feature, value);
}

function trainingRange(feature: FeatureDescription): string | null {
  const observed = feature.observed;
  if (feature.kind !== "numeric" || !observed || observed.min === undefined || observed.max === undefined) {
    return null;
  }
  return `${observed.min}–${observed.max}`;
}

/** The submitted measurements, grouped as in the dataset, with the range seen in training. */
export function ClinicalMeasurements({ schema, features, derived, highlight = [] }: ClinicalMeasurementsProps) {
  const values: Record<string, number | string | undefined> = { ...features, ...derived };
  const emphasised = new Set(highlight);
  return (
    <div className="measurements">
      {schema.groups.map((group) => {
        const rows = schema.features.filter((feature) => feature.group === group.key);
        if (rows.length === 0) return null;
        return (
          <section className="measurements__group" key={group.key} aria-label={group.title}>
            <h3 className="eyebrow">{group.title}</h3>
            <table className="table table--compact">
              <thead className="visually-hidden">
                <tr>
                  <th scope="col">Measurement</th>
                  <th scope="col">Value</th>
                  <th scope="col">Range in training data</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((feature) => {
                  const range = trainingRange(feature);
                  const value = values[feature.name];
                  const outside =
                    range !== null &&
                    typeof value === "number" &&
                    (value < feature.observed!.min! || value > feature.observed!.max!);
                  return (
                    <tr key={feature.name} data-highlight={emphasised.has(feature.name) ? "true" : undefined}>
                      <th scope="row">
                        {feature.label}
                        {feature.derived ? <span className="muted"> (computed)</span> : null}
                      </th>
                      <td className="num">
                        {display(feature, value)}
                        {feature.unit && feature.kind === "numeric" ? (
                          <span className="muted"> {feature.unit}</span>
                        ) : null}
                      </td>
                      <td className="num muted" data-outside={outside ? "true" : undefined}>
                        {range ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
      <p className="small muted measurements__note">
        The right-hand column is the range of each measurement in the training data. It is not a clinical
        reference range.
      </p>
    </div>
  );
}
