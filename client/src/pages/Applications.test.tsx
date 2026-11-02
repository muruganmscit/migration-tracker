import { describe, expect, it, beforeEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import { last, renderAt } from "../test/render";
import { installFakeApi, lastCall } from "../test/fakeApi";

beforeEach(() => installFakeApi());

describe("Applications page", () => {
  it("lists, filters and pages applications", async () => {
    const user = renderAt("/applications");
    expect(await screen.findByText("Cleanup App")).toBeInTheDocument();
    expect(screen.getByText("manual")).toBeInTheDocument();
    await user.selectOptions(screen.getAllByRole("combobox")[0], "ACTIVE");
    await user.selectOptions(screen.getAllByRole("combobox")[1], "CLEANUP");
    await user.selectOptions(screen.getAllByRole("combobox")[2], "2");
    await waitFor(() => expect(lastCall("get", "/applications")).toBeTruthy());
    await user.click(screen.getByLabelText("Next page"));
    await user.type(screen.getByPlaceholderText(/Search name/), "zzz");
    expect(await screen.findByText("No applications match your filters")).toBeInTheDocument();
  });

  it("opens an application from its row", async () => {
    const user = renderAt("/applications");
    await user.click(await screen.findByText("Done App"));
    expect(await screen.findByRole("heading", { name: "Done App", level: 2 })).toBeInTheDocument();
  });

  it("selects applications and runs bulk Start Cleanup and Archive", async () => {
    const user = renderAt("/applications");
    await screen.findByText("Cleanup App");
    await user.click(screen.getByLabelText("Select Cleanup App"));
    await user.click(screen.getByLabelText("Select Override App"));
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    expect(within(bar).getByText("2 selected")).toBeInTheDocument();
    await user.click(within(bar).getByRole("button", { name: /Start Cleanup \(1\)/ }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Start Cleanup" }));
    expect(await screen.findByText(/Cleanup started for 1 application/)).toBeInTheDocument();
    await user.click(screen.getByLabelText("Close result"));

    await user.click(screen.getByLabelText("Select all on this page"));
    await user.click(screen.getByRole("button", { name: /^Archive \(/ }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^Reason/), "Bulk");
    await user.click(within(dialog).getByRole("button", { name: /^Archive \d/ }));
    await waitFor(() => expect(document.body).toHaveTextContent(/Archived 0 applications, 1 not changed/));
    expect(screen.getByText(/Cleanup has already started/)).toBeInTheDocument();
    expect(lastCall("post", "/applications/bulk")?.data.reason).toBe("Bulk");

    await user.click(screen.getByLabelText("Select Done App"));
    await user.click(screen.getByLabelText("Select all on this page"));
    await user.click(screen.getByLabelText("Select all on this page"));
    await user.click(screen.getByLabelText("Select Done App"));
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("region", { name: "Bulk actions" })).not.toBeInTheDocument();
  });

  it("creates an application, showing server errors", async () => {
    const user = renderAt("/applications");
    await user.click(await screen.findByRole("button", { name: "New application" }));
    const d = screen.getByRole("dialog");
    await user.type(within(d).getByLabelText(/^App ID/), "DUP");
    await user.type(within(d).getByLabelText(/^Name/), "N");
    await user.type(within(d).getByLabelText(/^Owner/), "P");
    await user.type(within(d).getByLabelText(/^Team Contact/), "t@example.com");
    await user.selectOptions(within(d).getByLabelText(/^Wave/), "2");
    await user.type(within(d).getByLabelText("Target Start"), "2027-05-01");
    await user.type(within(d).getByLabelText("Target End"), "2027-04-01");
    expect(within(d).getByText(/must be on or before/)).toBeInTheDocument();
    await user.clear(within(d).getByLabelText("Target End"));
    await user.type(within(d).getByLabelText("Proposed Target"), "2027-06-01");
    await user.click(within(d).getByRole("button", { name: "Create application" }));
    expect(await within(d).findByRole("alert")).toHaveTextContent("already exists");
    await user.clear(within(d).getByLabelText(/^App ID/));
    await user.type(within(d).getByLabelText(/^App ID/), "NEW");
    await user.click(within(d).getByRole("button", { name: "Create application" }));
    expect(await screen.findByRole("heading", { name: "Cleanup App", level: 2 })).toBeInTheDocument();
  });

  it("uploads files and shows the import result", async () => {
    const user = renderAt("/applications");
    await user.click(await screen.findByRole("button", { name: "Upload CSV/Excel" }));
    const d = screen.getByRole("dialog");
    await user.click(within(d).getByText("Applications columns"));
    await user.click(within(d).getByRole("button", { name: /applications.csv template/ }));
    await user.upload(within(d).getByLabelText("Files"), new File(["appId\n"], "applications.csv", { type: "text/csv" }));
    await user.click(within(d).getByRole("button", { name: "Upload" }));
    expect(await screen.findByText(/Import finished with 1 row skipped/)).toBeInTheDocument();
    expect(screen.getByText(/Row 3:/)).toBeInTheDocument();
    expect(screen.getByText("APP-9:")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Close import result"));
    await user.click(screen.getByRole("button", { name: "New application" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  });

  it("shows the empty state", async () => {
    installFakeApi({ empty: true });
    const user = renderAt("/applications");
    expect(await screen.findByText("No applications yet")).toBeInTheDocument();
    await user.click(last(screen.getAllByRole("button", { name: /New application/ })));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
