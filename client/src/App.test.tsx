import { describe, expect, it, beforeEach } from "vitest";
import { screen, within, waitFor, fireEvent } from "@testing-library/react";
import { renderAt } from "./test/render";
import { installFakeApi, lastCall } from "./test/fakeApi";
import { statusLabel, badgeClass, progressBarColor, progressHexColor, iconBadge, formatHealth } from "./ui";
import { errorMessage, Reports } from "./api/client";

beforeEach(() => installFakeApi());

describe("navigation and helpers", () => {
  it("shows the menu and redirects the hidden Reports page", async () => {
    renderAt("/reports");
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Applications" })).toBeInTheDocument();
  });

  it("formats labels and colours", () => {
    expect(statusLabel("NOT_STARTED")).toBe("Not started");
    expect(formatHealth("AT_RISK")).toBe("At risk");
    expect(badgeClass("UNKNOWN")).toContain("bg-slate-100");
    expect(progressBarColor("NOPE")).toContain("bg-blue");
    expect(progressHexColor()).toBe("#2563eb");
    expect(progressHexColor("OVERDUE")).toBe("#f43f5e");
    expect(iconBadge()).toContain("rounded-md");
    expect(errorMessage({ response: { data: { error: "x" } } })).toBe("x");
    expect(errorMessage(new Error("boom"))).toMatch(/Something went wrong/);
    expect(Reports.exportUrl("pdf", { wave: "2", search: undefined })).toBe("/api/reports/export?format=pdf&wave=2");
  });
});

describe("Dashboard", () => {
  it("shows stats, waves, phases and weekly progress, and saves wave dates", async () => {
    renderAt("/");
    expect(await screen.findByText("Active Applications")).toBeInTheDocument();
    expect(await screen.findByText("Wave 2")).toBeInTheDocument();
    expect(screen.getByText("+ 1 archived", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Weekly progress")).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("Target start")[0], { target: { value: "2027-01-01" } });
    await waitFor(() => expect(lastCall("patch", "/waves/1")?.data).toEqual({ targetStartDate: "2027-01-01" }));
    fireEvent.change(screen.getAllByLabelText("Target end")[1], { target: { value: "" } });
    await waitFor(() => expect(lastCall("patch", "/waves/2")?.data).toEqual({ targetDate: null }));
  });

  it("shows empty states with no data", async () => {
    installFakeApi({ empty: true });
    renderAt("/");
    expect(await screen.findByText("No applications yet")).toBeInTheDocument();
    expect(await screen.findByText("No progress to show yet")).toBeInTheDocument();
  });
});

describe("Email templates", () => {
  it("lists templates and saves edits", async () => {
    const user = renderAt("/email-templates");
    const subjects = await screen.findAllByLabelText("Subject");
    await user.clear(subjects[0]);
    await user.type(subjects[0], "New subject");
    await user.type(screen.getAllByLabelText("Body (HTML)")[0], "!");
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]);
    await waitFor(() => expect(lastCall("patch", "/email-templates/CLEANUP_STARTED")?.data.subject).toBe("New subject"));
    expect(within(screen.getAllByRole("table")[0]).getByText("{{appName}}")).toBeInTheDocument();
  });
});
