// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type Issue, type IssuePage, type Project } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import IssuesPage from "./IssuesPage";

const project: Project = {
  id: "p1",
  key: "NIM",
  name: "Nimbus",
  description: null,
  archived: false,
  createdAt: "2026-10-19T00:00:00Z",
};
const dana = { id: "u1", displayName: "Dana", avatarUrl: null };
const issue = (number: number, title: string, over: Partial<Issue> = {}): Issue => ({
  id: `i${number}`,
  key: `NIM-${number}`,
  number,
  type: "Story",
  title,
  description: null,
  priority: "Medium",
  status: { id: "s1", name: "To do", category: "TODO" },
  reporter: dana,
  assignee: null,
  createdAt: "2026-10-19T00:00:00Z",
  updatedAt: "2026-10-19T00:00:00Z",
  version: 0,
  ...over,
});
const page = (items: Issue[], total = items.length): IssuePage => ({
  items,
  total,
  page: 0,
  size: 50,
});

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(api, "project").mockResolvedValue(project);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreMatchMedia();
});

function show(url = "/projects/NIM/issues") {
  return render(
    <NimbusThemeProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/projects/:key/issues" element={<IssuesPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </NimbusThemeProvider>,
  );
}

describe("IssuesPage", () => {
  it("lists the Issues, each linking to its page, with the total and Create Issue", async () => {
    vi.spyOn(api, "issues").mockResolvedValue(
      page([issue(2, "Fix login", { assignee: dana, type: "Bug" }), issue(1, "Plan sprint")]),
    );
    show();

    const link = await screen.findByRole("link", { name: /Fix login/ });
    expect(link.getAttribute("href")).toBe("/issues/NIM-2");
    expect(link.textContent).toContain("Dana");
    expect(screen.getByRole("link", { name: /Plan sprint/ }).textContent).toContain("Unassigned");
    expect(screen.getByText("2 Issues")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Create Issue" })).toBeTruthy();
  });

  it("sends the quick filter chosen and shows when nothing matches", async () => {
    const issues = vi.spyOn(api, "issues").mockResolvedValueOnce(page([issue(1, "A")]));
    show();
    await screen.findByText("A");

    issues.mockResolvedValue(page([]));
    fireEvent.click(screen.getByText("Assigned to me"));

    await screen.findByText("No Issues match these filters.");
    expect(issues).toHaveBeenLastCalledWith("NIM", expect.objectContaining({ assignee: "me" }));
  });

  it("reads filters, sort and page from the address", async () => {
    const issues = vi.spyOn(api, "issues").mockResolvedValue(page([issue(1, "A")], 120));
    show(
      "/projects/NIM/issues?type=Bug&priority=Urgent&sort=priority&page=1&category=DONE&assignee=none&q=login",
    );

    await screen.findByText("A");
    expect(issues).toHaveBeenCalledWith("NIM", {
      type: "Bug",
      priority: "Urgent",
      sort: "priority",
      page: 1,
      category: "DONE",
      assignee: "none",
      q: "login",
      size: 50,
    });
    // 120 Issues at 50 a page is three pages; the second is current.
    expect(screen.getByRole("button", { name: "2" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    await waitFor(() =>
      expect(issues).toHaveBeenLastCalledWith("NIM", expect.objectContaining({ page: 2 })),
    );
  });

  it("searches the title once typing pauses", async () => {
    const issues = vi.spyOn(api, "issues").mockResolvedValue(page([issue(1, "A")]));
    show();
    await screen.findByText("A");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "login" } });

    await waitFor(() =>
      expect(issues).toHaveBeenLastCalledWith("NIM", expect.objectContaining({ q: "login" })),
    );
  });

  it("hides Create Issue for an Archived project", async () => {
    vi.spyOn(api, "project").mockResolvedValue({ ...project, archived: true });
    vi.spyOn(api, "issues").mockResolvedValue(page([]));
    show();

    await screen.findByText("No Issues yet. Create one to get started.");
    expect(screen.queryByRole("button", { name: "Create Issue" })).toBeNull();
  });
});
