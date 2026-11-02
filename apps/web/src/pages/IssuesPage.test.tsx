// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The drag itself needs a real layout; the tests end it by hand with the handler the Board gave dnd-kit.
let dragEnd: ((event: unknown) => void) | undefined;
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: (props: React.ComponentProps<typeof actual.DndContext>) => {
      dragEnd = props.onDragEnd as (event: unknown) => void;
      return <actual.DndContext {...props} />;
    },
  };
});
import { api, type Issue, type IssuePage, type Project, type ProjectStatus } from "../api/client";
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

const statuses: ProjectStatus[] = [
  { id: "s1", name: "To do", category: "TODO", position: 0 },
  { id: "s2", name: "In progress", category: "IN_PROGRESS", position: 1 },
];
/** Answers each Status's column with the Issues of that Status, as the server does. */
function byStatus(all: Issue[]) {
  return vi.spyOn(api, "issues").mockImplementation(async (_key, search) => {
    const items = all.filter((item) => !search.status || item.status.name === search.status);
    return page(items);
  });
}
const inProgress = { id: "s2", name: "In progress", category: "IN_PROGRESS" as const };

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
  vi.spyOn(api, "projectStatuses").mockResolvedValue(statuses);
  try {
    localStorage.clear();
  } catch {
    // No storage in this environment.
  }
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
    show("/projects/NIM/issues?view=table");

    const link = await screen.findByRole("link", { name: /Fix login/ });
    expect(link.getAttribute("href")).toBe("/issues/NIM-2");
    expect(link.closest("tr")?.textContent).toContain("Dana");
    expect(screen.getByRole("link", { name: /Plan sprint/ }).closest("tr")?.textContent).toContain(
      "Unassigned",
    );
    expect(screen.getByText("1–2 of 2")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Create Issue" })).toBeTruthy();
  });

  it("sends the quick filter chosen and shows when nothing matches", async () => {
    const issues = vi.spyOn(api, "issues").mockResolvedValueOnce(page([issue(1, "A")]));
    show("/projects/NIM/issues?view=table");
    await screen.findByText("A");

    issues.mockResolvedValue(page([]));
    fireEvent.click(screen.getByText("Assigned to me"));

    await screen.findByText("No Issues match these filters.");
    expect(issues).toHaveBeenLastCalledWith("NIM", expect.objectContaining({ assignee: "me" }));
  });

  it("reads filters, sort and page from the address", async () => {
    const issues = vi.spyOn(api, "issues").mockResolvedValue(page([issue(1, "A")], 120));
    show(
      "/projects/NIM/issues?view=table&type=Bug&priority=Urgent&sort=priority&page=1&category=DONE&assignee=none&q=login",
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
    // 120 Issues at 50 a page: the second page shows 51–51 here, and Next goes to the third.
    expect(screen.getByText(/51–51 of 120/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    await waitFor(() =>
      expect(issues).toHaveBeenLastCalledWith("NIM", expect.objectContaining({ page: 2 })),
    );
  });

  it("searches the title once typing pauses", async () => {
    const issues = vi.spyOn(api, "issues").mockResolvedValue(page([issue(1, "A")]));
    show("/projects/NIM/issues?view=table");
    await screen.findByText("A");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "login" } });

    await waitFor(() =>
      expect(issues).toHaveBeenLastCalledWith("NIM", expect.objectContaining({ q: "login" })),
    );
  });

  it("clears every filter at once", async () => {
    const issues = vi.spyOn(api, "issues").mockResolvedValue(page([issue(1, "A")]));
    show("/projects/NIM/issues?view=table&type=Bug&q=login");
    await screen.findByText("A");

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(issues).toHaveBeenLastCalledWith("NIM", { size: 50 }));
  });

  it("hides Create Issue for an Archived project", async () => {
    vi.spyOn(api, "project").mockResolvedValue({ ...project, archived: true });
    vi.spyOn(api, "issues").mockResolvedValue(page([]));
    show();

    await screen.findByText("No Issues yet");
    expect(screen.queryByRole("button", { name: "Create Issue" })).toBeNull();
  });

  it("groups the List by Status, in the Statuses' order", async () => {
    byStatus([issue(1, "Plan sprint"), issue(2, "Fix login", { status: inProgress })]);
    show();

    const todo = await screen.findByRole("region", { name: "To do" });
    expect(within(todo).getByText("Plan sprint")).toBeTruthy();
    const doing = screen.getByRole("region", { name: "In progress" });
    expect(within(doing).getByText("Fix login")).toBeTruthy();
  });

  it("shows a column for each Status on the Board and moves an Issue dropped on another", async () => {
    byStatus([issue(1, "Plan sprint")]);
    const move = vi
      .spyOn(api, "moveIssue")
      .mockResolvedValue(issue(1, "Plan sprint", { status: inProgress }));
    show("/projects/NIM/issues?view=board");

    await screen.findByRole("link", { name: /Plan sprint/ });
    expect(screen.getByRole("region", { name: "To do" })).toBeTruthy();
    // dnd-kit measures real boxes, which jsdom doesn't have: end the drag as it would, over the second Status.
    act(() =>
      dragEnd?.({ active: { id: "NIM-1" }, over: { data: { current: { status: statuses[1] } } } }),
    );

    await waitFor(() => expect(move).toHaveBeenCalledWith("NIM-1", "s2"));
  });

  it("does nothing when a card is dropped on the Status it is already in", async () => {
    byStatus([issue(1, "Plan sprint")]);
    const move = vi.spyOn(api, "moveIssue");
    show("/projects/NIM/issues?view=board");
    await screen.findByRole("link", { name: /Plan sprint/ });

    act(() =>
      dragEnd?.({ active: { id: "NIM-1" }, over: { data: { current: { status: statuses[0] } } } }),
    );

    expect(move).not.toHaveBeenCalled();
  });

  it("puts each Assignee in a lane on the Swimlanes", async () => {
    byStatus([issue(1, "Plan sprint", { assignee: dana }), issue(2, "Fix login")]);
    show("/projects/NIM/issues?view=swimlanes");

    expect((await screen.findAllByText("Dana")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0);
    const cell = screen.getByRole("group", { name: "Dana, To do" });
    expect(within(cell).getByText("Plan sprint")).toBeTruthy();
  });

  it("sorts the Table from its headers", async () => {
    const issues = vi.spyOn(api, "issues").mockResolvedValue(page([issue(1, "A")]));
    show("/projects/NIM/issues?view=table");
    await screen.findByText("A");

    fireEvent.click(screen.getByRole("button", { name: "Priority" }));

    await waitFor(() =>
      expect(issues).toHaveBeenLastCalledWith("NIM", expect.objectContaining({ sort: "priority" })),
    );
  });

  it("switches views, keeps the filters and remembers the view for the project", async () => {
    const issues = byStatus([issue(1, "Plan sprint")]);
    show("/projects/NIM/issues?type=Bug");
    await screen.findByRole("region", { name: "To do" });

    fireEvent.click(screen.getByRole("button", { name: "Board" }));

    await waitFor(() =>
      expect(issues).toHaveBeenLastCalledWith(
        "NIM",
        expect.objectContaining({ type: "Bug", status: expect.any(String) }),
      ),
    );
    expect(localStorage.getItem("nimbus.issues.view.NIM")).toBe("board");
  });
});
