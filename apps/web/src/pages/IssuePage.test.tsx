// @vitest-environment jsdom
import { ApiError } from "@repo/api";
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type Issue, type IssueHistoryEntry } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { SessionContext, type Session } from "../auth/useSession";
import IssuePage from "./IssuePage";

const session = { user: { id: "u1", displayName: "Dana" } } as unknown as Session;
const history: IssueHistoryEntry[] = [
  {
    id: "h2",
    actor: { id: "u1", displayName: "Dana", avatarUrl: null },
    at: "2026-11-02T01:00:00Z",
    field: "priority",
    before: "Medium",
    after: "High",
  },
  {
    id: "h1",
    actor: { id: "u1", displayName: "Dana", avatarUrl: null },
    at: "2026-11-02T00:00:00Z",
    field: "created",
    before: null,
    after: null,
  },
];

const issue: Issue = {
  id: "i1",
  key: "NIM-12",
  number: 12,
  type: "Bug",
  title: "Crash on save",
  description:
    "- [ ] reproduce\n\n<script>window.hacked = true</script>\n\n[bad](javascript:alert(1))",
  priority: "High",
  status: { id: "s1", name: "To do", category: "TODO" },
  reporter: { id: "u1", displayName: "Dana", avatarUrl: null },
  assignee: null,
  createdAt: "2026-11-02T00:00:00Z",
  updatedAt: "2026-11-02T00:00:00Z",
  version: 0,
};

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
  Element.prototype.scrollIntoView = () => {};
  // Mantine's autosizing Textarea listens to the document's fonts, which jsdom lacks.
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {} },
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(api, "issueHistory").mockResolvedValue(history);
  vi.spyOn(api, "projectStatuses").mockResolvedValue([
    { id: "s1", name: "To do", category: "TODO", position: 0 },
    { id: "s2", name: "In progress", category: "IN_PROGRESS", position: 1 },
    { id: "s3", name: "Done", category: "DONE", position: 2 },
  ]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "fonts");
  restoreMatchMedia();
});

function showAt(path: string) {
  return render(
    <NimbusThemeProvider>
      <QueryClientProvider client={createQueryClient()}>
        <SessionContext value={session}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/issues/:issueKey" element={<IssuePage />} />
            </Routes>
          </MemoryRouter>
        </SessionContext>
      </QueryClientProvider>
    </NimbusThemeProvider>,
  );
}

describe("an Issue's page", () => {
  it("shows its key, type, title, Status, priority, Reporter and no Assignee", async () => {
    vi.spyOn(api, "issue").mockResolvedValue(issue);
    showAt("/issues/nim-12");

    expect(await screen.findByRole("heading", { name: "Crash on save" })).toBeTruthy();
    expect(screen.getAllByText("NIM-12").length).toBeGreaterThan(0);
    expect((screen.getByRole("combobox", { name: "Status" }) as HTMLInputElement).value).toBe(
      "To do",
    );
    expect((screen.getByRole("combobox", { name: "Priority" }) as HTMLInputElement).value).toBe(
      "High",
    );
    expect((screen.getByRole("combobox", { name: "Issue type" }) as HTMLInputElement).value).toBe(
      "Bug",
    );
    expect(screen.getAllByText("Dana").length).toBeGreaterThan(0);
    expect((screen.getByRole("combobox", { name: "Assignee" }) as HTMLInputElement).value).toBe(
      "Unassigned",
    );
  });

  it("renders the description as Markdown without running scripts or unsafe links", async () => {
    vi.spyOn(api, "issue").mockResolvedValue(issue);
    const { container } = showAt("/issues/NIM-12");

    await screen.findByRole("heading", { name: "Crash on save" });
    expect(screen.getByRole("checkbox")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/window\.hacked/)).toBeTruthy();
    const link = screen.getByText("bad").closest("a");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });

  it("lists the history newest first", async () => {
    vi.spyOn(api, "issue").mockResolvedValue(issue);
    showAt("/issues/NIM-12");

    const changed = await screen.findByText("Dana changed the priority from “Medium” to “High”");
    const created = screen.getByText("Dana created this Issue");
    expect(
      changed.compareDocumentPosition(created) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("saves a new title with the version the page was opened at", async () => {
    vi.spyOn(api, "issue").mockResolvedValue(issue);
    const edit = vi
      .spyOn(api, "editIssue")
      .mockResolvedValue({ ...issue, title: "Fixed", version: 1 });
    showAt("/issues/NIM-12");

    fireEvent.click(await screen.findByRole("button", { name: "Edit title" }));
    const input = screen.getByLabelText("Title");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "Fixed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(edit).toHaveBeenCalledWith("NIM-12", { title: "Fixed", version: 0 }),
    );
    expect(await screen.findByRole("heading", { name: "Fixed" })).toBeTruthy();
  });

  it("says the Issue changed since it was opened when the save is refused as stale", async () => {
    vi.spyOn(api, "issue").mockResolvedValue(issue);
    vi.spyOn(api, "editIssue").mockRejectedValue(
      new ApiError(409, "This Issue changed since you opened it", {}, null, "issue_changed"),
    );
    showAt("/issues/NIM-12");

    fireEvent.click(await screen.findByRole("button", { name: "Edit description" }));
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("This Issue changed since you opened it")).toBeTruthy();
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("Mine");
  });

  it("changes the priority and the Assignee without a version", async () => {
    vi.spyOn(api, "issue").mockResolvedValue(issue);
    const edit = vi.spyOn(api, "editIssue").mockResolvedValue({ ...issue, priority: "Low" });
    const assign = vi.spyOn(api, "assignIssue").mockResolvedValue({
      ...issue,
      assignee: { id: "u1", displayName: "Dana", avatarUrl: null },
    });
    showAt("/issues/NIM-12");

    fireEvent.click(await screen.findByRole("combobox", { name: "Priority" }));
    fireEvent.click(await screen.findByRole("option", { name: "Low", hidden: true }));
    await waitFor(() => expect(edit).toHaveBeenCalledWith("NIM-12", { priority: "Low" }));

    fireEvent.click(screen.getByRole("combobox", { name: "Assignee" }));
    fireEvent.click(await screen.findByRole("option", { name: "Dana", hidden: true }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("NIM-12", "u1"));
  });

  it("lists the project's Statuses in order and moves the Issue to the one chosen", async () => {
    vi.spyOn(api, "issue").mockResolvedValue(issue);
    const move = vi.spyOn(api, "moveIssue").mockResolvedValue({
      ...issue,
      status: { id: "s3", name: "Done", category: "DONE" },
    });
    showAt("/issues/NIM-12");

    fireEvent.click(await screen.findByRole("combobox", { name: "Status" }));
    const statusNames = () =>
      screen
        .getAllByRole("option", { hidden: true })
        .map((option) => option.textContent)
        .filter((name) => ["To do", "In progress", "Done"].includes(name ?? ""));
    await waitFor(() => expect(statusNames()).toHaveLength(3));
    const names = statusNames();
    expect(names.indexOf("To do")).toBeLessThan(names.indexOf("In progress"));
    expect(names.indexOf("In progress")).toBeLessThan(names.indexOf("Done"));
    fireEvent.click(await screen.findByRole("option", { name: "Done", hidden: true }));

    await waitFor(() => expect(move).toHaveBeenCalledWith("NIM-12", "s3"));
    await waitFor(() =>
      expect((screen.getByRole("combobox", { name: "Status" }) as HTMLInputElement).value).toBe(
        "Done",
      ),
    );
  });

  it("says the Issue is not found for an unknown key", async () => {
    vi.spyOn(api, "issue").mockRejectedValue(new ApiError(404, "Issue not found"));
    showAt("/issues/NIM-99");

    expect(await screen.findByText("Issue not found.")).toBeTruthy();
  });
});
