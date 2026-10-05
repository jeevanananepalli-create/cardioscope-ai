/**
 * End-to-end flow inside the frontend: patient input -> API client -> prediction ->
 * dashboard -> 3D update. The API is a fake; the WebGL scene is a stand-in.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dashboard } from "@/components/dashboard/Dashboard";
import { ApiError } from "@/lib/api";
import { NO_PREDICTION_COLOR, RISK_COLORS } from "@/lib/constants";

import { createApiMock, predictionFixture, validFeatures } from "./fixtures";
import { enableWebgl } from "./sceneMock";

vi.mock("@/components/anatomy/AnatomyScene", async () => import("./sceneMock"));

async function analyze() {
  await userEvent.click(screen.getByRole("button", { name: "Analyze Patient" }));
}

describe("input → API → prediction → dashboard → 3D", () => {
  beforeEach(() => enableWebgl());

  it("shows neutral vessels, then colours them from the API's predictions", async () => {
    const api = createApiMock();
    render(<Dashboard api={api} />);
    await userEvent.click(await screen.findByRole("button", { name: "Fill typical values" }));
    expect(await screen.findByTestId("mesh-LAD")).toHaveAttribute("data-color", NO_PREDICTION_COLOR);

    await analyze();

    expect(await screen.findByTestId("cad-probability")).toHaveTextContent("81%");
    expect(api.predict).toHaveBeenCalledWith(validFeatures);
    expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.very_high);
    expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-probability", "0.84");
    expect(screen.getByTestId("mesh-LCX")).toHaveAttribute("data-color", RISK_COLORS.moderate);
    expect(screen.getByTestId("mesh-RCA")).toHaveAttribute("data-color", RISK_COLORS.low);
  });

  it("updates the 3D view when a new prediction arrives", async () => {
    const predict = vi
      .fn()
      .mockResolvedValueOnce(predictionFixture())
      .mockResolvedValueOnce(predictionFixture({ CAD: 0.2, LAD: 0.1, LCX: 0.8, RCA: 0.55 }));
    render(<Dashboard api={createApiMock({ predict })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Fill typical values" }));
    await analyze();
    await waitFor(() => expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.very_high));

    await userEvent.selectOptions(screen.getByLabelText(/^Sex/), "Female");
    await analyze();

    await waitFor(() => expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.low));
    expect(screen.getByTestId("mesh-LCX")).toHaveAttribute("data-color", RISK_COLORS.very_high);
    expect(screen.getByTestId("mesh-RCA")).toHaveAttribute("data-color", RISK_COLORS.high);
    expect(predict).toHaveBeenLastCalledWith({ ...validFeatures, Sex: "Female" });
  });

  it("returns the vessels to neutral if a later prediction fails", async () => {
    const predict = vi
      .fn()
      .mockResolvedValueOnce(predictionFixture())
      .mockRejectedValue(new ApiError("network", "The prediction service could not be reached."));
    render(<Dashboard api={createApiMock({ predict })} />);
    await userEvent.click(await screen.findByRole("button", { name: "Fill typical values" }));
    await analyze();
    await waitFor(() => expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", RISK_COLORS.very_high));
    await analyze();
    await waitFor(() => expect(screen.getByTestId("mesh-LAD")).toHaveAttribute("data-color", NO_PREDICTION_COLOR));
  });
});
