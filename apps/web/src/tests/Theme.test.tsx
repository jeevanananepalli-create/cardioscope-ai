import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dashboard } from "@/components/dashboard/Dashboard";

import { createApiMock } from "./fixtures";

describe("theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("starts light and can be switched to dark and back", async () => {
    render(<Dashboard api={createApiMock()} />);
    await screen.findByRole("button", { name: "Analyze Patient" });
    expect(document.documentElement.dataset.theme).toBe("light");

    await userEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("cardioscope-theme")).toBe("dark");

    await userEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("remembers the chosen theme", async () => {
    window.localStorage.setItem("cardioscope-theme", "dark");
    render(<Dashboard api={createApiMock()} />);
    await screen.findByRole("button", { name: "Switch to light theme" });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("keeps the safety disclaimer in either theme", async () => {
    render(<Dashboard api={createApiMock()} />);
    await screen.findByRole("button", { name: "Analyze Patient" });
    await userEvent.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(screen.getByRole("note", { name: /safety disclaimer/i })).toHaveTextContent("It is not a medical device");
  });
});
