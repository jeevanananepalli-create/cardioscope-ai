import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dashboard } from "@/components/dashboard/Dashboard";
import { SHAPBarChart } from "@/components/explainability/SHAPBarChart";
import { ApiError } from "@/lib/api";

import { createApiMock, explanationFixture, validFeatures } from "./fixtures";
import { enableWebgl } from "./sceneMock";

vi.mock("@/components/anatomy/AnatomyScene", async () => import("./sceneMock"));

async function analyzed(api = createApiMock()) {
  render(<Dashboard api={api} />);
  await userEvent.click(await screen.findByRole("button", { name: "Fill typical values" }));
  await userEvent.click(screen.getByRole("button", { name: "Analyze Patient" }));
  await screen.findByTestId("cad-probability");
  return api;
}

const BANNED = /proves|caus(e|es|ed|al link)|is blocked|blockage|diagnos(is|ed) confirmed/i;

describe("SHAPBarChart", () => {
  it("lists the largest contributions with their values and directions", () => {
    render(<SHAPBarChart explanation={explanationFixture.explanations.LAD!} limit={2} />);
    const rows = within(screen.getByRole("list", { name: /contributions to the LAD model/ })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Age = 58 years");
    expect(rows[0]).toHaveTextContent("+0.400");
    expect(rows[1]).toHaveTextContent("ST elevation = 0");
    expect(rows[1]).toHaveTextContent("−0.200");
    expect(screen.getByText(/1 other features together contribute \+0\.100/)).toBeInTheDocument();
    expect(screen.getByText(/probability points of the model’s raw score/)).toBeInTheDocument();
  });
});

describe("explanations in the dashboard", () => {
  beforeEach(() => enableWebgl());

  it("requests one explanation per prediction and shows the CAD model first", async () => {
    const api = await analyzed();
    await screen.findByRole("list", { name: /contributions to the CAD model/ });
    expect(api.explain).toHaveBeenCalledTimes(1);
    expect(api.explain).toHaveBeenCalledWith(validFeatures);
    expect(screen.getByText(/They are not causal/)).toBeInTheDocument();
  });

  it("does not request an explanation before there is a prediction", async () => {
    const api = createApiMock();
    render(<Dashboard api={api} />);
    await screen.findByRole("button", { name: "Analyze Patient" });
    expect(api.explain).not.toHaveBeenCalled();
    expect(screen.getByText("No explanation yet")).toBeInTheDocument();
  });

  it("does not compute an explanation while nothing on screen shows one", async () => {
    const api = createApiMock();
    render(<Dashboard api={api} />);
    await userEvent.click(await screen.findByRole("button", { name: "Fill typical values" }));
    await userEvent.click(screen.getByRole("tab", { name: "Model performance" }));
    await userEvent.click(screen.getByRole("button", { name: "Analyze Patient" }));
    await screen.findByTestId("cad-probability");
    expect(api.predict).toHaveBeenCalledTimes(1);
    expect(api.explain).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("tab", { name: "Why this prediction?" }));
    await screen.findByRole("list", { name: /contributions to the CAD model/ });
    expect(api.explain).toHaveBeenCalledTimes(1);

    // Leaving and coming back reuses the result.
    await userEvent.click(screen.getByRole("tab", { name: "Model performance" }));
    await userEvent.click(screen.getByRole("tab", { name: "Why this prediction?" }));
    await screen.findByRole("list", { name: /contributions to the CAD model/ });
    expect(api.explain).toHaveBeenCalledTimes(1);
  });

  it("switches the explanation between models without another request", async () => {
    const api = await analyzed();
    await screen.findByRole("list", { name: /contributions to the CAD model/ });
    await userEvent.click(screen.getByRole("tab", { name: /^RCA/ }));
    expect(screen.getByRole("list", { name: /contributions to the RCA model/ })).toBeInTheDocument();
    expect(api.explain).toHaveBeenCalledTimes(1);
  });

  it("shows vessel details and that vessel's explanation when a vessel is selected in 3D", async () => {
    await analyzed();
    expect(screen.getByText("No vessel selected")).toBeInTheDocument();
    await userEvent.click(await screen.findByTestId("mesh-LAD"));

    const detail = within(await screen.findByTestId("vessel-detail"));
    expect(detail.getByText("Left anterior descending artery")).toBeInTheDocument();
    expect(detail.getByText("84.0%")).toBeInTheDocument();
    expect(detail.getByText("Model predicts LAD stenosis")).toBeInTheDocument();
    expect(detail.getByText("Very high")).toBeInTheDocument();
    expect(detail.getByRole("rowheader", { name: "Age" })).toBeInTheDocument();
    expect(detail.getByText("58 years")).toBeInTheDocument();
    expect(detail.getByRole("row", { name: /ST elevation No/ })).toBeInTheDocument();
    expect(detail.getByText("Age contributes toward a higher predicted LAD risk.")).toBeInTheDocument();
    expect(detail.getByText(/do not indicate a lesion/)).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: /^LAD/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("list", { name: /contributions to the LAD model/ })).toBeInTheDocument();
  });

  it("selects a vessel from its risk card too", async () => {
    await analyzed();
    const cards = within(screen.getByRole("list", { name: "Vessel stenosis predictions" }));
    await userEvent.click(cards.getByRole("button", { name: /LCX/ }));
    expect(await screen.findByTestId("vessel-detail")).toHaveTextContent("Left circumflex artery");
    expect(screen.getByTestId("scene")).toHaveAttribute("data-selected", "LCX");
  });

  it("never words a contribution as causal or as an anatomical finding", async () => {
    await analyzed();
    await userEvent.click(await screen.findByTestId("mesh-RCA"));
    await screen.findByTestId("vessel-detail");
    expect(document.body.textContent ?? "").not.toMatch(BANNED);
  });

  it("keeps the prediction and offers a retry when the explanation fails", async () => {
    const explain = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("explanation_failed", "The explanation for the CAD model could not be computed."))
      .mockResolvedValue(explanationFixture);
    await analyzed(createApiMock({ explain }));
    expect(await screen.findByText("The explanation could not be loaded.")).toBeInTheDocument();
    expect(screen.getByTestId("cad-probability")).toHaveTextContent("81%");
    expect(screen.getByTestId("LAD-probability")).toHaveTextContent("84%");
    const panel = within(screen.getByRole("tabpanel", { name: "Why this prediction?" }));
    await userEvent.click(panel.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("list", { name: /contributions to the CAD model/ })).toBeInTheDocument());
  });
});
