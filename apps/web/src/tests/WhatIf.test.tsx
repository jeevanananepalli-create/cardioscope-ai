import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dashboard } from "@/components/dashboard/Dashboard";
import { suggestedFeatures } from "@/components/what-if/WhatIfSimulator";
import { ApiError } from "@/lib/api";
import { RISK_COLORS } from "@/lib/constants";

import { createApiMock, modelInfoFixture, predictionFixture, schemaFixture, validFeatures } from "./fixtures";
import { enableWebgl } from "./sceneMock";

vi.mock("@/components/anatomy/AnatomyScene", async () => import("./sceneMock"));

const BEFORE = predictionFixture({ CAD: 0.81, LAD: 0.84, LCX: 0.41, RCA: 0.12 });
const AFTER = predictionFixture({ CAD: 0.67, LAD: 0.6, LCX: 0.2, RCA: 0.12 });

async function openSimulator(api = createApiMock({ predict: vi.fn().mockResolvedValueOnce(BEFORE).mockResolvedValue(AFTER) })) {
  render(<Dashboard api={api} />);
  await userEvent.click(await screen.findByRole("button", { name: "Fill typical values" }));
  await userEvent.click(screen.getByRole("button", { name: "Analyze Patient" }));
  await screen.findByTestId("cad-probability");
  await userEvent.click(screen.getByRole("tab", { name: /What-if simulation/ }));
  return api;
}

function row(target: string) {
  return within(screen.getByTestId(`comparison-${target}`));
}

describe("what-if simulator", () => {
  beforeEach(() => enableWebgl());

  it("is unavailable until a patient has been analyzed", async () => {
    render(<Dashboard api={createApiMock()} />);
    await screen.findByRole("button", { name: "Analyze Patient" });
    await userEvent.click(screen.getByRole("tab", { name: /What-if simulation/ }));
    expect(screen.getByText(/Analyze a patient first/)).toBeInTheDocument();
  });

  it("is labelled as exploratory and makes no causal or treatment claim", async () => {
    await openSimulator();
    const panel = within(screen.getByRole("tabpanel", { name: /What-if simulation/ }));
    expect(panel.getByText("Exploratory model simulation")).toBeInTheDocument();
    expect(panel.getByText(/not treatment advice/)).toBeInTheDocument();
    expect(panel.getByText(/not cause and effect/)).toBeInTheDocument();
  });

  it("starts from the analyzed values and makes no request until something changes", async () => {
    const api = await openSimulator();
    await userEvent.click(screen.getByRole("button", { name: "Turn on what-if mode" }));
    expect(screen.getByRole("slider", { name: "Age" })).toHaveValue("58");
    expect(row("CAD").getByText("81%")).toBeInTheDocument();
    expect(screen.getByText(/No inputs changed yet/)).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(api.predict).toHaveBeenCalledTimes(1);
  });

  it("re-runs the models with the changed input and shows before, after and change", async () => {
    const api = await openSimulator();
    await userEvent.click(screen.getByRole("button", { name: "Turn on what-if mode" }));
    fireEvent.change(screen.getByRole("slider", { name: "Age" }), { target: { value: "70" } });

    await waitFor(() => expect(api.predict).toHaveBeenCalledTimes(2));
    expect(api.predict).toHaveBeenLastCalledWith({ ...validFeatures, Age: 70 });
    await waitFor(() => expect(row("CAD").getByText("67%")).toBeInTheDocument());
    expect(row("CAD").getByText("81%")).toBeInTheDocument();
    expect(row("CAD").getByText("−14.0 pts")).toBeInTheDocument();
    expect(row("LAD").getByText("−24.0 pts")).toBeInTheDocument();
    expect(row("LCX").getByText("−21.0 pts")).toBeInTheDocument();
    expect(row("RCA").getByText("no change")).toBeInTheDocument();
    expect(screen.getByText(/1 input changed: Age/)).toBeInTheDocument();
  });

  it("updates the 3D view with the simulated output and labels it", async () => {
    await openSimulator();
    expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.very_high);
    await userEvent.click(screen.getByRole("button", { name: "Turn on what-if mode" }));
    fireEvent.change(screen.getByRole("slider", { name: "Age" }), { target: { value: "70" } });

    await waitFor(() => expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.high));
    expect(screen.getByTestId("mesh-LCX")).toHaveAttribute("data-color", RISK_COLORS.low);
    expect(within(screen.getByTestId("anatomy-stage")).getByText("Exploratory model simulation")).toBeInTheDocument();
    // The analyzed patient's result is still what the risk summary reports.
    expect(screen.getByTestId("cad-probability")).toHaveTextContent("81%");
  });

  it("returns to the analyzed prediction on reset and when the mode is turned off", async () => {
    await openSimulator();
    await userEvent.click(screen.getByRole("button", { name: "Turn on what-if mode" }));
    fireEvent.change(screen.getByRole("slider", { name: "Age" }), { target: { value: "70" } });
    await waitFor(() => expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.high));

    await userEvent.click(screen.getByRole("button", { name: "Reset to analyzed values" }));
    await waitFor(() => expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.very_high));
    expect(screen.getByRole("slider", { name: "Age" })).toHaveValue("58");
    expect(within(screen.getByTestId("anatomy-stage")).queryByText("Exploratory model simulation")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider", { name: "Age" }), { target: { value: "70" } });
    await waitFor(() => expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.high));
    await userEvent.click(screen.getByRole("button", { name: "Turn off what-if mode" }));
    expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.very_high);
  });

  it("supports yes/no and categorical inputs, and adding another input", async () => {
    const api = await openSimulator();
    await userEvent.click(screen.getByRole("button", { name: "Turn on what-if mode" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Hypertension" }), "No");
    await waitFor(() => expect(api.predict).toHaveBeenLastCalledWith({ ...validFeatures, HTN: 0 }));

    await userEvent.selectOptions(screen.getByRole("combobox", { name: /Change another input/ }), "BBB");
    const panel = within(screen.getByRole("tabpanel", { name: /What-if simulation/ }));
    await userEvent.selectOptions(panel.getByRole("combobox", { name: "Bundle branch block" }), "LBBB");
    await waitFor(() => expect(api.predict).toHaveBeenLastCalledWith({ ...validFeatures, HTN: 0, BBB: "LBBB" }));
    expect(await screen.findByText(/2 inputs changed/)).toBeInTheDocument();
  });

  it("limits sliders to the training range", async () => {
    await openSimulator();
    await userEvent.click(screen.getByRole("button", { name: "Turn on what-if mode" }));
    const age = screen.getByRole("slider", { name: "Age" });
    expect(age).toHaveAttribute("min", "30");
    expect(age).toHaveAttribute("max", "86");
  });

  it("reports a failed simulation and falls back to the analyzed prediction in 3D", async () => {
    const predict = vi
      .fn()
      .mockResolvedValueOnce(BEFORE)
      .mockRejectedValue(new ApiError("network", "The prediction service could not be reached."));
    await openSimulator(createApiMock({ predict }));
    await userEvent.click(screen.getByRole("button", { name: "Turn on what-if mode" }));
    fireEvent.change(screen.getByRole("slider", { name: "Age" }), { target: { value: "70" } });
    expect(await screen.findByText("The simulation could not be run.")).toBeInTheDocument();
    expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.very_high);
    expect(screen.getByTestId("cad-probability")).toHaveTextContent("81%");
  });

  it("discards the simulation when a new patient is analyzed", async () => {
    await openSimulator();
    await userEvent.click(screen.getByRole("button", { name: "Turn on what-if mode" }));
    fireEvent.change(screen.getByRole("slider", { name: "Age" }), { target: { value: "70" } });
    await waitFor(() => expect(row("CAD").getByText("67%")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Analyze Patient" }));
    await waitFor(() => expect(screen.getByText(/No inputs changed yet/)).toBeInTheDocument());
    expect(screen.getByRole("slider", { name: "Age" })).toHaveValue("58");
  });
});

describe("suggested what-if inputs", () => {
  it("offers the inputs the models rely on most, and never a derived feature", () => {
    const names = suggestedFeatures(schemaFixture, modelInfoFixture, 3);
    expect(names.slice(0, 2)).toEqual(["Age", "HTN"]);
    expect(names).not.toContain("BMI");
    expect(names).toHaveLength(3);
  });
});
