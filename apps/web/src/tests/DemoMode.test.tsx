import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dashboard } from "@/components/dashboard/Dashboard";
import { ApiError } from "@/lib/api";

import { createApiMock, demoProfilesFixture, predictionFixture } from "./fixtures";

describe("demo mode", () => {
  it("offers clearly labelled synthetic profiles", async () => {
    render(<Dashboard api={createApiMock()} />);
    const demo = within(await screen.findByRole("region", { name: "Demo mode" }));
    expect(demo.getByText("Synthetic · not real patients")).toBeInTheDocument();
    expect(demo.getByRole("button", { name: "Demo Profile A — Elevated model risk" })).toBeInTheDocument();
    expect(demo.getByRole("button", { name: "Demo Profile B — Lower model risk" })).toBeInTheDocument();
    expect(demo.getByText(/They are not real patients/)).toBeInTheDocument();
  });

  it("fills the form and gets the prediction from the API, not from the profile", async () => {
    const api = createApiMock({ predict: vi.fn(async () => predictionFixture({ CAD: 0.93, LAD: 0.9, LCX: 0.6, RCA: 0.7 })) });
    render(<Dashboard api={api} />);
    await userEvent.click(await screen.findByRole("button", { name: /Demo Profile A/ }));

    expect(await screen.findByTestId("cad-probability")).toHaveTextContent("93%");
    expect(api.predict).toHaveBeenCalledTimes(1);
    expect(api.predict).toHaveBeenCalledWith(demoProfilesFixture.profiles[0]!.features);
    expect(screen.getByLabelText(/^Age/)).toHaveValue("68");
    expect(screen.getByRole("button", { name: /Demo Profile A/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Synthetic demo profile")).toBeInTheDocument();
    expect(screen.getByText(/not a real patient/)).toBeInTheDocument();
  });

  it("stops calling the inputs a demo profile once they are edited", async () => {
    render(<Dashboard api={createApiMock()} />);
    await userEvent.click(await screen.findByRole("button", { name: /Demo Profile B/ }));
    await screen.findByTestId("cad-probability");
    expect(screen.getByLabelText(/^Sex/)).toHaveValue("Female");

    await userEvent.type(screen.getByLabelText(/^Age/), "1");
    expect(screen.getByRole("button", { name: /Demo Profile B/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Synthetic demo profile")).not.toBeInTheDocument();
    expect(screen.getByText("Inputs have changed since this prediction.")).toBeInTheDocument();
  });

  it("switches between profiles", async () => {
    const api = createApiMock();
    render(<Dashboard api={api} />);
    await userEvent.click(await screen.findByRole("button", { name: /Demo Profile A/ }));
    await screen.findByTestId("cad-probability");
    await userEvent.click(screen.getByRole("button", { name: /Demo Profile B/ }));
    await waitFor(() => expect(api.predict).toHaveBeenCalledTimes(2));
    expect(api.predict).toHaveBeenLastCalledWith(demoProfilesFixture.profiles[1]!.features);
    expect(screen.getByLabelText(/^Age/)).toHaveValue("41");
  });

  it("works without demo profiles if they cannot be loaded", async () => {
    const demoProfiles = vi.fn().mockRejectedValue(new ApiError("server", "unavailable"));
    render(<Dashboard api={createApiMock({ demoProfiles })} />);
    expect(await screen.findByRole("button", { name: "Analyze Patient" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Demo mode" })).not.toBeInTheDocument();
    expect(screen.getByText("Models ready")).toBeInTheDocument();
  });
});
