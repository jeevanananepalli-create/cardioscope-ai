import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dashboard } from "@/components/dashboard/Dashboard";
import { ApiError } from "@/lib/api";
import { SAFETY_DISCLAIMER } from "@/lib/constants";

import { createApiMock, modelInfoFixture, predictionFixture, validFeatures } from "./fixtures";

async function loadAndAnalyze(api = createApiMock()) {
  render(<Dashboard api={api} />);
  await userEvent.click(await screen.findByRole("button", { name: "Fill typical values" }));
  await userEvent.click(screen.getByRole("button", { name: "Analyze Patient" }));
  return api;
}

function expectDisclaimer() {
  expect(screen.getByRole("note", { name: /safety disclaimer/i })).toHaveTextContent(SAFETY_DISCLAIMER);
}

describe("Dashboard", () => {
  it("shows the safety disclaimer before anything has loaded", () => {
    render(<Dashboard api={createApiMock({ featureSchema: vi.fn(() => new Promise<never>(() => {})) })} />);
    expectDisclaimer();
    expect(screen.getByText("Connecting to service…")).toBeInTheDocument();
  });

  it("loads the form from the schema and reports that models are ready", async () => {
    render(<Dashboard api={createApiMock()} />);
    expect(await screen.findByLabelText(/^Age/)).toBeInTheDocument();
    expect(screen.getByText("Models ready")).toBeInTheDocument();
    expect(screen.getByText("No prediction yet")).toBeInTheDocument();
    expectDisclaimer();
  });

  it("sends validated input to the API and renders the four predictions", async () => {
    const api = await loadAndAnalyze();
    expect(await screen.findByTestId("cad-probability")).toHaveTextContent("81%");
    expect(api.predict).toHaveBeenCalledTimes(1);
    expect(api.predict).toHaveBeenCalledWith(validFeatures);
    expect(screen.getByTestId("LAD-probability")).toHaveTextContent("84%");
    expect(screen.getByTestId("LCX-probability")).toHaveTextContent("41%");
    expect(screen.getByTestId("RCA-probability")).toHaveTextContent("12%");
    expect(screen.getByText("Model predicts CAD")).toBeInTheDocument();
    expect(screen.getByText("Very high visualization category")).toBeInTheDocument();
    const vessels = screen.getByRole("list", { name: "Vessel stenosis predictions" });
    expect(within(vessels).getByText("Model predicts LCX stenosis")).toBeInTheDocument();
    expect(within(vessels).getByText("Model predicts no RCA stenosis")).toBeInTheDocument();
  });

  it("never describes a prediction as a diagnosis", async () => {
    await loadAndAnalyze();
    await screen.findByTestId("cad-probability");
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/diagnosis confirmed|confirmed|blockage found|is blocked/i);
    expect(text).toMatch(/not clinically validated/);
    expect(text).toMatch(/not diagnoses/);
  });

  it("does not call the API when the form is invalid", async () => {
    const api = createApiMock();
    render(<Dashboard api={api} />);
    await userEvent.click(await screen.findByRole("button", { name: "Analyze Patient" }));
    expect(api.predict).not.toHaveBeenCalled();
    expect(screen.getByText("Age is required.")).toBeInTheDocument();
  });

  it("lists the measurements used and the API-derived BMI after analysis", async () => {
    await loadAndAnalyze();
    await screen.findByTestId("cad-probability");
    await userEvent.click(screen.getByRole("tab", { name: "Clinical measurements" }));
    const table = within(screen.getByRole("tabpanel", { name: "Clinical measurements" }));
    expect(table.getByRole("rowheader", { name: "Age" })).toBeInTheDocument();
    expect(table.getByRole("rowheader", { name: /Body mass index/ })).toBeInTheDocument();
    expect(table.getByText("27.2")).toBeInTheDocument();
    expect(table.getByText(/not a clinical reference range/)).toBeInTheDocument();
  });

  it("flags the result as out of date when inputs change afterwards", async () => {
    await loadAndAnalyze();
    await screen.findByTestId("cad-probability");
    await userEvent.type(screen.getByLabelText(/^Age/), "1");
    expect(screen.getByText("Inputs have changed since this prediction.")).toBeInTheDocument();
  });

  it("shows input warnings returned by the API", async () => {
    const withWarning = {
      ...predictionFixture(),
      warnings: [{ field: "Age", message: "Age 95 is outside the range seen in training (30–86)." }],
    };
    await loadAndAnalyze(createApiMock({ predict: vi.fn(async () => withWarning) }));
    expect(await screen.findByText(/Age 95 is outside the range seen in training/)).toBeInTheDocument();
  });

  describe("error states", () => {
    it("explains an unreachable backend at start-up and recovers on retry", async () => {
      const featureSchema = vi
        .fn()
        .mockRejectedValueOnce(new ApiError("network", "The prediction service could not be reached."))
        .mockResolvedValue((await createApiMock().featureSchema()) as never);
      render(<Dashboard api={createApiMock({ featureSchema })} />);
      expect(await screen.findByText("The patient form could not be loaded.")).toBeInTheDocument();
      expect(screen.getByText("Service unreachable")).toBeInTheDocument();
      expectDisclaimer();
      await userEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByLabelText(/^Age/)).toBeInTheDocument();
    });

    it("reports a backend that goes away during prediction, with a retry", async () => {
      const predict = vi
        .fn()
        .mockRejectedValueOnce(new ApiError("network", "The prediction service could not be reached."))
        .mockResolvedValue(predictionFixture());
      await loadAndAnalyze(createApiMock({ predict }));
      expect(await screen.findByText("The prediction service is not reachable.")).toBeInTheDocument();
      expect(screen.queryByTestId("cad-probability")).not.toBeInTheDocument();
      expectDisclaimer();
      await userEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByTestId("cad-probability")).toHaveTextContent("81%");
    });

    it("explains unavailable models when a prediction is refused", async () => {
      const predict = vi.fn().mockRejectedValue(
        new ApiError("model_unavailable", "Prediction models are not available (CAD). Train the models."),
      );
      await loadAndAnalyze(createApiMock({ predict }));
      expect(await screen.findByText("The prediction models are not available.")).toBeInTheDocument();
      expect(screen.getByText("Models not available")).toBeInTheDocument();
    });

    it("warns up front when the service has no trained models", async () => {
      const modelInfo = vi.fn(async () => ({
        ...modelInfoFixture,
        model_version: null,
        models_available: { CAD: false, LAD: false, LCX: false, RCA: false },
        targets: {},
      }));
      render(<Dashboard api={createApiMock({ modelInfo })} />);
      expect(await screen.findByText("The prediction models are not available.")).toBeInTheDocument();
      expect(screen.getByText(/train_all/)).toBeInTheDocument();
    });

    it("puts field errors from the API onto the form", async () => {
      const predict = vi.fn().mockRejectedValue(
        new ApiError("invalid_input", "The request has 1 invalid field(s).", [
          { field: "Age", message: "Must be at most 110." },
        ]),
      );
      await loadAndAnalyze(createApiMock({ predict }));
      expect(await screen.findByText("The service did not accept the patient data.")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText(/^Age/)).toHaveAttribute("aria-invalid", "true"));
    });

    it("handles a malformed response without showing a result", async () => {
      const predict = vi.fn().mockRejectedValue(
        new ApiError("malformed_response", "The prediction service returned a response this application does not understand."),
      );
      await loadAndAnalyze(createApiMock({ predict }));
      expect(await screen.findByText("The service returned an unexpected response.")).toBeInTheDocument();
      expect(screen.queryByTestId("cad-probability")).not.toBeInTheDocument();
    });

    it("clears a previous result when a later prediction fails", async () => {
      const predict = vi
        .fn()
        .mockResolvedValueOnce(predictionFixture())
        .mockRejectedValue(new ApiError("server", "The prediction could not be completed."));
      await loadAndAnalyze(createApiMock({ predict }));
      await screen.findByTestId("cad-probability");
      await userEvent.click(screen.getByRole("button", { name: "Analyze Patient" }));
      await waitFor(() => expect(screen.queryByTestId("cad-probability")).not.toBeInTheDocument());
      expect(screen.queryByTestId("LAD-probability")).not.toBeInTheDocument();
    });
  });
});
