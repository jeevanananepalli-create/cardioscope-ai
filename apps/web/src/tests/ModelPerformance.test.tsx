import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dashboard } from "@/components/dashboard/Dashboard";
import { ModelPerformance } from "@/components/dashboard/ModelPerformance";
import type { ModelInfo } from "@/types/prediction";

import { createApiMock, modelInfoFixture } from "./fixtures";

/** A copy of the fixture with distinctive numbers, to prove the view shows what it is given. */
function withMetrics(): ModelInfo {
  const info = structuredClone(modelInfoFixture);
  const rca = info.targets.RCA!;
  rca.holdout!.metrics = {
    ...rca.holdout!.metrics,
    accuracy: 0.6123,
    precision: 0.5432,
    recall: 0.4321,
    f1: 0.4812,
    roc_auc: 0.6789,
    brier: 0.2198,
    confusion_matrix: { tn: 31, fp: 7, fn: 13, tp: 10 },
    threshold: 0.38,
  };
  rca.holdout!.confidence_intervals_95.roc_auc = { lower: 0.5234, upper: 0.8123 };
  rca.holdout!.reference_baseline.accuracy = 0.6234;
  rca.final_configuration_cross_validation!.roc_auc = { mean: 0.7412, std: 0.0587 };
  rca.selection_reason = "Chosen by the documented rule (test text).";
  rca.calibration = { ...rca.calibration, method: "sigmoid", reason: "Adopted sigmoid calibration (test text)." };
  return info;
}

describe("ModelPerformance", () => {
  it("shows the metrics it is given, for every target", () => {
    render(<ModelPerformance modelInfo={withMetrics()} />);
    const holdout = within(screen.getByTestId("holdout-table"));
    for (const target of ["CAD", "LAD", "LCX", "RCA"]) {
      expect(holdout.getByRole("rowheader", { name: target })).toBeInTheDocument();
    }
    expect(screen.getByTestId("holdout-RCA-accuracy")).toHaveTextContent("0.612");
    expect(screen.getByTestId("holdout-RCA-precision")).toHaveTextContent("0.543");
    expect(screen.getByTestId("holdout-RCA-recall")).toHaveTextContent("0.432");
    expect(screen.getByTestId("holdout-RCA-f1")).toHaveTextContent("0.481");
    expect(screen.getByTestId("holdout-RCA-roc_auc")).toHaveTextContent("0.679 (0.52–0.81)");
    expect(screen.getByTestId("holdout-RCA-brier")).toHaveTextContent("0.220");
    expect(holdout.getByText("0.623")).toBeInTheDocument();
    expect(within(screen.getByTestId("cv-table")).getByText("0.741")).toBeInTheDocument();
  });

  it("shows the confusion matrix, calibration and selection reasoning per model", async () => {
    render(<ModelPerformance modelInfo={withMetrics()} />);
    await userEvent.click(screen.getByRole("tab", { name: "RCA" }));
    expect(screen.getByTestId("confusion-RCA-tn")).toHaveTextContent("31");
    expect(screen.getByTestId("confusion-RCA-fp")).toHaveTextContent("7");
    expect(screen.getByTestId("confusion-RCA-fn")).toHaveTextContent("13");
    expect(screen.getByTestId("confusion-RCA-tp")).toHaveTextContent("10");
    expect(screen.getByText(/decision threshold 38%/)).toBeInTheDocument();
    expect(screen.getByText("Chosen by the documented rule (test text).")).toBeInTheDocument();
    expect(screen.getByText("Adopted sigmoid calibration (test text).")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Calibration curve for the RCA model" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Global feature importance for the RCA model/ })).toBeInTheDocument();
  });

  it("draws ROC curves and the class distribution from the supplied data", () => {
    render(<ModelPerformance modelInfo={withMetrics()} />);
    expect(screen.getByRole("img", { name: /ROC curves on the holdout set: .*RCA AUC 0\.68/ })).toBeInTheDocument();
    const distribution = within(screen.getByRole("list", { name: "Class distribution in the full dataset" }));
    expect(distribution.getByText(/216 cad · 87 normal/)).toBeInTheDocument();
    expect(distribution.getByText(/114 stenotic · 189 normal/)).toBeInTheDocument();
  });

  it("states the limits of the evidence", () => {
    render(<ModelPerformance modelInfo={withMetrics()} />);
    expect(screen.getByText(/not evidence of clinical performance/)).toBeInTheDocument();
    expect(screen.getByText(/have not been validated on other patients/)).toBeInTheDocument();
  });

  it("shows no numbers when there are no trained models", () => {
    render(<ModelPerformance modelInfo={{ ...modelInfoFixture, targets: {} }} />);
    expect(screen.getByText("No model results available")).toBeInTheDocument();
    expect(screen.queryByTestId("holdout-table")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/0\.\d{3}/);
  });

  it("says so when holdout evaluation has not been run, instead of inventing results", () => {
    const info = structuredClone(modelInfoFixture);
    for (const metadata of Object.values(info.targets)) metadata!.holdout = null;
    render(<ModelPerformance modelInfo={info} />);
    expect(screen.getByText("Holdout evaluation has not been run for every model.")).toBeInTheDocument();
    expect(screen.queryByTestId("holdout-table")).not.toBeInTheDocument();
    expect(screen.getByTestId("cv-table")).toBeInTheDocument();
  });

  it("is reachable from the dashboard before any patient is analyzed", async () => {
    render(<Dashboard api={createApiMock()} />);
    await screen.findByRole("button", { name: "Analyze Patient" });
    await userEvent.click(screen.getByRole("tab", { name: "Model performance" }));
    expect(await screen.findByTestId("holdout-table")).toBeInTheDocument();
  });
});
