"use client";

import { memo, useState } from "react";

import { ClassDistribution, ConfusionMatrix } from "@/components/charts/ConfusionMatrix";
import { ReliabilityChart, RocChart, TARGET_COLORS } from "@/components/charts/RocChart";
import { EmptyState, Notice } from "@/components/common/Notice";
import { Tabs } from "@/components/common/Tabs";
import {
  type HoldoutEvaluation,
  type MetricSummary,
  type ModelInfo,
  type ModelMetadata,
  type TargetName,
  TARGETS,
} from "@/types/prediction";

interface ModelPerformanceProps {
  modelInfo: ModelInfo | null;
}

const METRICS = [
  { key: "accuracy", label: "Accuracy" },
  { key: "precision", label: "Precision" },
  { key: "recall", label: "Recall" },
  { key: "f1", label: "F1" },
  { key: "roc_auc", label: "ROC-AUC" },
  { key: "brier", label: "Brier" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

const ALGORITHM_NAMES: Record<string, string> = {
  logistic_regression: "Logistic regression",
  random_forest: "Random forest",
  xgboost: "XGBoost",
  svm: "Support vector machine",
};

function holdoutCell(holdout: HoldoutEvaluation, metric: MetricKey) {
  const interval = holdout.confidence_intervals_95[metric];
  return (
    <>
      {holdout.metrics[metric].toFixed(3)}
      {interval ? (
        <span className="muted">
          {" "}
          ({interval.lower.toFixed(2)}–{interval.upper.toFixed(2)})
        </span>
      ) : null}
    </>
  );
}

function cvCell(summary: Record<string, MetricSummary>, metric: MetricKey) {
  const value = summary[metric];
  if (!value) return "—";
  return (
    <>
      {value.mean.toFixed(3)} <span className="muted">± {value.std.toFixed(3)}</span>
    </>
  );
}

function TargetDetail({ metadata }: { metadata: ModelMetadata }) {
  const holdout = metadata.holdout;
  const importance = metadata.global_importance?.features.slice(0, 8) ?? [];
  const largest = Math.max(...importance.map((feature) => feature.mean_abs_shap), 0);
  return (
    <div className="performance__detail">
      <div>
        <h4 className="eyebrow">Confusion matrix</h4>
        {holdout ? (
          <ConfusionMatrix target={metadata.target} matrix={holdout.metrics.confusion_matrix} threshold={holdout.metrics.threshold} />
        ) : (
          <p className="small muted">Not evaluated yet.</p>
        )}
      </div>
      <div>
        <h4 className="eyebrow">Calibration</h4>
        <ReliabilityChart
          target={metadata.target}
          crossValidated={metadata.calibration.reliability_curve}
          holdout={holdout?.reliability_curve ?? null}
        />
      </div>
      <div className="performance__notes">
        <h4 className="eyebrow">How this model was chosen</h4>
        <dl className="facts facts--stacked">
          <div>
            <dt>Model</dt>
            <dd>
              {ALGORITHM_NAMES[metadata.algorithm] ?? metadata.algorithm} <code>{metadata.candidate}</code>
            </dd>
          </div>
          <div>
            <dt>Selection</dt>
            <dd>{metadata.selection_reason}</dd>
          </div>
          <div>
            <dt>Calibration ({metadata.calibration.method})</dt>
            <dd>{metadata.calibration.reason}</dd>
          </div>
          {metadata.calibration.threshold_reason ? (
            <div>
              <dt>Decision threshold ({(metadata.decision_threshold * 100).toFixed(0)}%)</dt>
              <dd>{metadata.calibration.threshold_reason}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      <div>
        <h4 className="eyebrow">Most influential features overall</h4>
        {importance.length > 0 ? (
          <>
            <ol className="importance" aria-label={`Global feature importance for the ${metadata.target} model`}>
              {importance.map((feature) => (
                <li key={feature.feature}>
                  <span className="importance__label">{feature.label}</span>
                  <span className="importance__track" aria-hidden="true">
                    <span
                      style={{
                        width: `${largest > 0 ? (feature.mean_abs_shap / largest) * 100 : 0}%`,
                        background: TARGET_COLORS[metadata.target],
                      }}
                    />
                  </span>
                  <span className="num small">{feature.mean_abs_shap.toFixed(3)}</span>
                </li>
              ))}
            </ol>
            <p className="small muted">
              Mean absolute SHAP value on the {metadata.global_importance?.computed_on}. This shows what the
              model relies on; it is not evidence of cause.
            </p>
          </>
        ) : (
          <p className="small muted">Not computed yet.</p>
        )}
      </div>
    </div>
  );
}

/** Evaluation results for the four models. Every number comes from the evaluation pipeline. */
export const ModelPerformance = memo(function ModelPerformance({ modelInfo }: ModelPerformanceProps) {
  const [detail, setDetail] = useState<TargetName>("CAD");
  const available = TARGETS.filter((target) => modelInfo?.targets[target]);

  if (!modelInfo || available.length === 0) {
    return (
      <EmptyState title="No model results available">
        Results appear here once the models have been trained and evaluated.
      </EmptyState>
    );
  }

  const models = available.map((target) => modelInfo.targets[target]!);
  const evaluated = models.filter((metadata) => metadata.holdout);
  const first = models[0]!;
  const holdoutByTarget = Object.fromEntries(evaluated.map((m) => [m.target, m.holdout!])) as Partial<
    Record<TargetName, HoldoutEvaluation>
  >;
  const shown = modelInfo.targets[detail] ?? first;

  return (
    <div className="performance">
      <Notice tone="info" title="How to read these results">
        Measured on one public dataset of {first.training.n_development + first.training.n_holdout} records, with{" "}
        {first.training.n_holdout} held out for testing. Samples this small give wide uncertainty, shown as 95%
        intervals. The models have not been validated on other patients, and these numbers are not evidence of
        clinical performance.
      </Notice>

      {evaluated.length < models.length ? (
        <Notice tone="warning" title="Holdout evaluation has not been run for every model.">
          Run <code>python -m ml.scripts.evaluate_all</code> and restart the API to see holdout results.
        </Notice>
      ) : null}

      {evaluated.length > 0 ? (
        <section aria-label="Holdout results">
          <h3 className="performance__heading">Holdout set</h3>
          <p className="small muted">
            Evaluated once, after every modelling decision was fixed. Brackets are 95% bootstrap intervals.
            “No-information accuracy” is what always predicting the more common class would score.
          </p>
          <div className="table-scroll">
            <table className="table" data-testid="holdout-table">
              <thead>
                <tr>
                  <th scope="col">Target</th>
                  <th scope="col">Model</th>
                  {METRICS.map((metric) => (
                    <th scope="col" className="num" key={metric.key}>
                      {metric.label}
                    </th>
                  ))}
                  <th scope="col" className="num">
                    No-information accuracy
                  </th>
                </tr>
              </thead>
              <tbody>
                {evaluated.map((metadata) => (
                  <tr key={metadata.target}>
                    <th scope="row">{metadata.target}</th>
                    <td>{ALGORITHM_NAMES[metadata.algorithm] ?? metadata.algorithm}</td>
                    {METRICS.map((metric) => (
                      <td className="num" key={metric.key} data-testid={`holdout-${metadata.target}-${metric.key}`}>
                        {holdoutCell(metadata.holdout!, metric.key)}
                      </td>
                    ))}
                    <td className="num">{metadata.holdout!.reference_baseline.accuracy.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section aria-label="Cross-validation results">
        <h3 className="performance__heading">Cross-validation</h3>
        <p className="small muted">
          Repeated stratified {first.training.cross_validation.n_splits}-fold, {first.training.cross_validation.n_repeats}{" "}
          repeats, on the {first.training.n_development} development records. Mean ± standard deviation across folds.
        </p>
        <div className="table-scroll">
          <table className="table" data-testid="cv-table">
            <thead>
              <tr>
                <th scope="col">Target</th>
                {METRICS.map((metric) => (
                  <th scope="col" className="num" key={metric.key}>
                    {metric.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((metadata) => (
                <tr key={metadata.target}>
                  <th scope="row">{metadata.target}</th>
                  {METRICS.map((metric) => (
                    <td className="num" key={metric.key}>
                      {cvCell(metadata.final_configuration_cross_validation ?? metadata.cross_validation, metric.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="performance__charts">
        {evaluated.length > 0 ? (
          <section aria-label="ROC curves">
            <h3 className="performance__heading">ROC curves (holdout)</h3>
            <RocChart holdout={holdoutByTarget} />
          </section>
        ) : null}
        {modelInfo.class_distribution ? (
          <section aria-label="Class distribution">
            <h3 className="performance__heading">Class distribution (full dataset)</h3>
            <ClassDistribution distribution={modelInfo.class_distribution} />
          </section>
        ) : null}
      </div>

      <section aria-label="Per-model detail">
        <h3 className="performance__heading">Per-model detail</h3>
        <Tabs
          label="Model"
          variant="pill"
          items={available.map((target) => ({ key: target, label: target }))}
          active={shown.target}
          onChange={setDetail}
        >
          <TargetDetail metadata={shown} />
        </Tabs>
      </section>
    </div>
  );
});
