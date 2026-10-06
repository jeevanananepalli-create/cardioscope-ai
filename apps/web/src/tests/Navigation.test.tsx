import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dashboard } from "@/components/dashboard/Dashboard";
import { SAFETY_DISCLAIMER } from "@/lib/constants";

import { createApiMock } from "./fixtures";

describe("navigation", () => {
  it("opens on the landing page and starts the analysis from it", async () => {
    render(<Dashboard api={createApiMock()} initialView="home" />);
    expect(screen.getByRole("heading", { name: /From Clinical Data/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Analyze Patient" })).not.toBeInTheDocument();
    // The safety statement is on every page.
    expect(screen.getByRole("note", { name: /safety disclaimer/i })).toHaveTextContent(SAFETY_DISCLAIMER);

    await userEvent.click(screen.getByRole("button", { name: "Start Analysis" }));
    expect(await screen.findByRole("button", { name: "Analyze Patient" })).toBeInTheDocument();
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.getByRole("button", { name: "Analyze" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the prediction when moving between pages", async () => {
    render(<Dashboard api={createApiMock()} />);
    await userEvent.click(await screen.findByRole("button", { name: /Demo Profile A/ }));
    const shown = (await screen.findByTestId("cad-probability")).textContent;

    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    await userEvent.click(nav.getByRole("button", { name: "Model" }));
    expect(screen.getByRole("region", { name: "Model performance" })).toBeInTheDocument();
    expect(screen.queryByTestId("cad-probability")).not.toBeInTheDocument();

    await userEvent.click(nav.getByRole("button", { name: "About" }));
    expect(screen.getByText(/not diagnoses/, { selector: "li" })).toBeInTheDocument();

    await userEvent.click(nav.getByRole("button", { name: "Analyze" }));
    expect(await screen.findByTestId("cad-probability")).toHaveTextContent(shown ?? "");
  });
});
