import { describe, expect, it, beforeEach } from "vitest";
import { screen, within, waitFor, fireEvent } from "@testing-library/react";
import { last, renderAt } from "../test/render";
import { failOnce, installFakeApi, lastCall } from "../test/fakeApi";

beforeEach(() => installFakeApi());
const dialog = () => screen.getByRole("dialog");

describe("Application page: Cleanup in progress", () => {
  it("edits details, recipients and runs the workflow actions", async () => {
    const user = renderAt("/applications/1");
    expect(await screen.findByRole("heading", { name: "Cleanup App", level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/started migrating, but Cleanup/)).toBeInTheDocument();

    const name = screen.getByLabelText("Name");
    await user.type(name, "!");
    fireEvent.blur(name);
    await waitFor(() => expect(lastCall("patch", "/applications/1")?.data).toEqual({ name: "Cleanup App!" }));
    await user.type(screen.getByLabelText("Owner"), "x");
    fireEvent.blur(screen.getByLabelText("Owner"));
    await user.type(screen.getByLabelText("Team Contact"), "x");
    fireEvent.blur(screen.getByLabelText("Team Contact"));
    await user.selectOptions(screen.getByLabelText(/^Wave/), "3");
    fireEvent.change(screen.getByLabelText("Target Start"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Target End"), { target: { value: "2027-01-01" } });
    fireEvent.change(screen.getByLabelText("Proposed Target Date"), { target: { value: "2027-02-01" } });

    await user.type(screen.getByLabelText("Recipient email"), "n@example.com");
    await user.type(screen.getByLabelText("Recipient name"), "N");
    await user.click(screen.getByRole("button", { name: "Add recipient" }));
    await waitFor(() => expect(lastCall("post", "/applications/1/recipients")?.data.email).toBe("n@example.com"));
    await user.click(screen.getByLabelText("Remove r@example.com"));

    await user.click(screen.getByRole("button", { name: "End Cleanup" }));
    await user.click(screen.getByRole("button", { name: "Send email now" }));
    await user.click(screen.getByRole("button", { name: "Archive application" }));
    await user.type(screen.getByLabelText("Archive reason"), "Not needed");
    await user.click(screen.getByRole("button", { name: "Confirm archive" }));
    await waitFor(() => expect(lastCall("post", "/applications/1/archive")?.data.reason).toBe("Not needed"));

    await user.click(screen.getByText("Override the phase"));
    await user.selectOptions(screen.getByLabelText("Override phase"), "ADOPTION");
    await user.type(screen.getByLabelText("Override reason"), "Signed off");
    await user.click(screen.getByRole("button", { name: "Apply override" }));
    await waitFor(() => expect(lastCall("patch", "/applications/1/migration-status")?.data).toEqual({ stage: "ADOPTION", reason: "Signed off" }));
  });

  it("makes Cleanup decisions per repo", async () => {
    const user = renderAt("/applications/1");
    await screen.findByText("repo-12");
    expect(screen.getByText("Already archived")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change" }));
    const row = screen.getByText("repo-12").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Keep" }));
    await user.click(within(row).getByRole("button", { name: "Archive" }));
    await user.click(within(row).getByRole("button", { name: "Cancel" }));
    await user.click(within(row).getByRole("button", { name: "Archive" }));
    await user.type(within(row).getByLabelText("Reason to archive repo-12"), "Unused");
    failOnce("patch", "/repos/12/cleanup-decision", "Decisions can only be made during Cleanup");
    await user.click(within(row).getByRole("button", { name: "Mark Archive" }));
    expect(await within(row).findByText(/only be made during Cleanup/)).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Mark Archive" }));
    await waitFor(() => expect(lastCall("patch", "/repos/12/cleanup-decision")?.data).toEqual({ decision: "ARCHIVE", reason: "Unused" }));
  });

  it("filters repos, pages, and manages issues", async () => {
    const user = renderAt("/applications/1");
    await screen.findByText("repo-11");
    await user.selectOptions(screen.getByDisplayValue("All statuses"), "MIGRATING");
    await user.selectOptions(screen.getByDisplayValue("All technologies"), "GO");
    await user.selectOptions(screen.getByDisplayValue("All pipeline types"), "CUSTOM");
    await user.click(last(screen.getAllByLabelText("Next page")));
    const row = screen.getByText("repo-11").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: /Issues \(1\)/ }));
    await user.click(screen.getAllByRole("button", { name: "Resolve" })[0]);
    await user.type(screen.getByPlaceholderText("New issue"), "Broken build");
    await user.click(screen.getByRole("button", { name: "Add issue" }));
    await waitFor(() => expect(lastCall("post", "/repos/11/issues")?.data.title).toBe("Broken build"));
    await user.type(screen.getByPlaceholderText("Search name"), "zzz");
    expect(await screen.findByText("No repos found")).toBeInTheDocument();
  });

  it("adds and edits repos in dialogs", async () => {
    const user = renderAt("/applications/1");
    await screen.findByText("repo-11");
    await user.click(screen.getByRole("button", { name: "Add repo" }));
    let d = dialog();
    await user.type(within(d).getByLabelText(/^Name/), "dup");
    await user.type(within(d).getByLabelText(/^Source URL/), "https://g/x");
    await user.type(within(d).getByLabelText("Target Project"), "hp");
    await user.selectOptions(within(d).getByLabelText("Technology"), "GO");
    await user.type(within(d).getByLabelText("Version"), "1");
    await user.selectOptions(within(d).getByLabelText("Pipeline Type"), "CUSTOM");
    await user.type(within(d).getByLabelText("Notes"), "n");
    await user.click(within(d).getByRole("button", { name: "Add repo" }));
    expect(await within(d).findByRole("alert")).toHaveTextContent("already exists");
    await user.clear(within(d).getByLabelText(/^Name/));
    await user.type(within(d).getByLabelText(/^Name/), "new-repo");
    await user.click(within(d).getByRole("button", { name: "Add repo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const row = screen.getByText("repo-12").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Edit" }));
    d = dialog();
    await user.selectOptions(within(d).getByLabelText(/^Status/), "NOT_STARTED");
    expect(within(d).getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.type(within(d).getByLabelText(/Reason for this status change/), "Redo");
    await user.clear(within(d).getByLabelText(/^Name/));
    await user.type(within(d).getByLabelText(/^Name/), "bad");
    await user.type(within(d).getByLabelText("Target Project"), "p");
    await user.selectOptions(within(d).getByLabelText("Technology"), "");
    await user.clear(within(d).getByLabelText("Version"));
    await user.selectOptions(within(d).getByLabelText("Pipeline Type"), "");
    await user.type(within(d).getByLabelText("Notes"), "n");
    await user.type(within(d).getByLabelText(/^Source URL/), "/x");
    await user.click(within(d).getByRole("button", { name: "Save changes" }));
    expect(await within(d).findByRole("alert")).toHaveTextContent("A reason is required");
    await user.clear(within(d).getByLabelText(/^Name/));
    await user.type(within(d).getByLabelText(/^Name/), "good");
    await user.click(within(d).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(lastCall("patch", "/repos/12")?.data).toMatchObject({ name: "good", status: "NOT_STARTED", statusReason: "Redo" }));
    await user.click(within(screen.getByText("repo-11").closest("tr")!).getByRole("button", { name: "Edit" }));
    await user.click(within(dialog()).getByLabelText("Close"));
  });

  it("updates repo statuses in bulk", async () => {
    const user = renderAt("/applications/1");
    await screen.findByText("repo-11");
    await user.click(screen.getByLabelText("Select repo-11"));
    await user.click(screen.getByLabelText("Select all repos on this page"));
    await user.click(screen.getByLabelText("Select all repos on this page"));
    await user.click(screen.getByLabelText("Select repo-11"));
    await user.click(screen.getByLabelText("Select repo-12"));
    await user.click(screen.getByLabelText("Select repo-13"));
    const bar = screen.getByRole("region", { name: "Repo bulk actions" });
    expect(within(bar).getByText("3 selected")).toBeInTheDocument();
    await user.click(within(bar).getByRole("button", { name: "Update status" }));
    const d = dialog();
    await user.selectOptions(within(d).getByLabelText("New status"), "MIGRATING");
    await user.selectOptions(within(d).getByLabelText("New status"), "ADOPTED");
    await user.type(within(d).getByLabelText(/^Reason, saved on every repo/), "Bulk");
    await user.click(within(d).getByRole("button", { name: /Update 3 repos/ }));
    expect(await screen.findByText(/1 repo moved to Adopted, 1 already there/)).toBeInTheDocument();
    expect(screen.getByText(/This application is archived/)).toBeInTheDocument();
    await user.click(screen.getByLabelText("Dismiss"));
    await user.click(screen.getByLabelText("Select repo-11"));
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
  });

  it("marks the application inactive after confirming", async () => {
    const user = renderAt("/applications/1");
    await screen.findByText("repo-11");
    await user.selectOptions(screen.getByLabelText(/^App Status/), "INACTIVE");
    await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    await user.selectOptions(screen.getByLabelText(/^App Status/), "INACTIVE");
    await user.type(within(dialog()).getByLabelText(/^Reason/), "Decommissioned");
    failOnce("post", "/applications/1/mark-inactive", "A Complete application can't be marked inactive");
    await user.click(within(dialog()).getByRole("button", { name: "Mark inactive and archive" }));
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("Complete");
    await user.click(within(dialog()).getByRole("button", { name: "Mark inactive and archive" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("Application page: other states", () => {
  it("shows a completed application and send-email errors", async () => {
    const user = renderAt("/applications/2");
    expect(await screen.findByRole("heading", { name: "Done App", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /not available once Complete/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Send email now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no notice");
    await user.click(screen.getByLabelText("Dismiss error"));
  });

  it("locks an archived application", async () => {
    renderAt("/applications/3");
    expect(await screen.findByText(/Reason: Gone/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add repo" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Select all repos on this page")).not.toBeInTheDocument();
  });

  it("shows an override, empty sections, and starts Cleanup", async () => {
    const user = renderAt("/applications/4");
    expect(await screen.findByText(/Manual override/)).toBeInTheDocument();
    expect(screen.getByText("No recipients yet")).toBeInTheDocument();
    expect(screen.getByText("No emails sent yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Return to automatic" }));
    await user.click(screen.getByRole("button", { name: "Start Cleanup" }));
    await waitFor(() => expect(lastCall("post", "/applications/4/cleanup/start")).toBeTruthy());
    await user.click(screen.getByRole("link", { name: "All applications" }));
    expect(await screen.findByRole("heading", { name: "Applications" })).toBeInTheDocument();
  });
});
