// @vitest-environment jsdom
import { ApiError } from "@repo/api";
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { toast } from "@repo/ui/toast";
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
import { SessionContext, type Session } from "../auth/useSession";
import IssuesPage from "./IssuesPage";
import { ProjectLayout } from "../projects/ProjectLayout";

const project: Project = {
  id: "p1",
  key: "NIM",
  name: "Nimbus",
  description: null,
  archived: false,
  createdAt: "2026-10-19T00:00:00Z",
  createdBy: { id: "u1", displayName: "Dana", avatarUrl: null },
  memberCount: 1,
  members: [{ id: "u1", displayName: "Dana", avatarUrl: null }],
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
  { id: "s1", name: "To do", category: "TODO", position: 0, isDefault: true },
  { id: "s2", name: "In progress", category: "IN_PROGRESS", position: 1, isDefault: false },
];
/** Answers each Status's column with the Issues of that Status, as the server does. */
function byStatus(all: Issue[]) {
  return vi.spyOn(api, "issues").mockImplementation(async (_key, search) => {
    const items = all.filter((item) => !search.status || item.status.name === search.status);
    return page(items);
  });
}
const inProgress = { id: "s2", name: "In progress", category: "IN_PROGRESS" as const };
const noCounts = { total: 0, statuses: {}, categories: {}, types: {}, priorities: {} };

const fullAccess = {
  "issues:issue:create": "project",
  "issues:issue:edit": "project",
  "issues:issue:delete": "project",
  "issues:status:manage": "project",
} as const;
const session = { user: { id: "u1", displayName: "Dana" } } as unknown as Session;

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
  vi.spyOn(api, "myProjectPermissions").mockResolvedValue(fullAccess);
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
  vi.spyOn(api, "issueCounts").mockResolvedValue(noCounts);
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
        <SessionContext value={session}>
          <MemoryRouter initialEntries={[url]}>
            <Routes>
              <Route path="/projects/:key" element={<ProjectLayout />}>
                <Route path="issues" element={<IssuesPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </SessionContext>
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
    fireEvent.click(screen.getByRole("button", { name: "Mine" }));

    await screen.findByText("No issues match these filters");
    expect(screen.getByText("Mine is on. Try removing it.")).toBeTruthy();
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

    fireEvent.change(screen.getByLabelText("Search issues"), { target: { value: "login" } });

    await waitFor(() =>
      expect(issues).toHaveBeenLastCalledWith("NIM", expect.objectContaining({ q: "login" })),
    );
  });

  it("clears every menu filter at once, keeping the search and the quick filters", async () => {
    const issues = vi.spyOn(api, "issues").mockResolvedValue(page([issue(1, "A")]));
    show("/projects/NIM/issues?view=table&type=Bug&priority=High&assignee=me&q=login");
    await screen.findByText("A");

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    await waitFor(() =>
      expect(issues).toHaveBeenLastCalledWith("NIM", { assignee: "me", q: "login", size: 50 }),
    );
  });

  it("hides Create Issue for an Archived project", async () => {
    vi.spyOn(api, "project").mockResolvedValue({ ...project, archived: true });
    vi.spyOn(api, "issues").mockResolvedValue(page([]));
    show();

    await screen.findByText("No Issues yet");
    expect(screen.queryByRole("button", { name: "Create Issue" })).toBeNull();
  });

  it("hides Create Issue from a User who may not create Issues", async () => {
    vi.spyOn(api, "myProjectPermissions").mockResolvedValue({});
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

  it.each(["list", "board", "swimlanes"])(
    "shows the %s in Rank order, whatever sort the address names",
    async (view) => {
      const issues = byStatus([issue(1, "Plan sprint")]);
      show(`/projects/NIM/issues?view=${view}&sort=priority`);

      await screen.findAllByText("Plan sprint");
      expect(issues).toHaveBeenCalledWith("NIM", expect.objectContaining({ status: "To do" }));
      for (const [, search] of issues.mock.calls) expect(search.sort).toBe("rank");
    },
  );

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

  it("shows a dropped card in its new column, and never back where it was, before the server answers", async () => {
    byStatus([issue(1, "Plan sprint")]);
    // Never answers, so only the Board's own update can have moved the card.
    vi.spyOn(api, "moveIssue").mockReturnValue(new Promise(() => {}));
    show("/projects/NIM/issues?view=board");
    await screen.findByRole("link", { name: /Plan sprint/ });

    // Microtasks only, as a browser runs before it paints: the Board hears about the move on a timeout, so until then
    // the card must not show in its old column.
    await act(async () =>
      dragEnd?.({ active: { id: "NIM-1" }, over: { data: { current: { status: statuses[1] } } } }),
    );
    const todo = screen.getByRole("region", { name: "To do" });
    const left = within(todo).queryByRole("link", { name: /Plan sprint/ });
    // The test doesn't load the CSS, so the class that hides it stands in for it.
    expect(left === null || /leaving/.test(left.className)).toBe(true);

    const doing = screen.getByRole("region", { name: "In progress" });
    expect(await within(doing).findByText("Plan sprint")).toBeTruthy();
  });

  it("refreshes the Board only when the last of several quick moves is answered", async () => {
    const all = [issue(1, "Plan sprint"), issue(2, "Fix login")];
    const issues = byStatus(all);
    const answers: ((moved: Issue) => void)[] = [];
    vi.spyOn(api, "moveIssue").mockImplementation(
      () => new Promise((resolve) => answers.push(resolve)),
    );
    show("/projects/NIM/issues?view=board");
    await screen.findByRole("link", { name: /Fix login/ });
    const drop = (key: string) =>
      act(() =>
        dragEnd?.({ active: { id: key }, over: { data: { current: { status: statuses[1] } } } }),
      );

    drop("NIM-1");
    drop("NIM-2");
    // They go to the server one at a time, in the order they were made: the second waits for the first's answer.
    await waitFor(() => expect(answers).toHaveLength(1));
    const asked = issues.mock.calls.length;

    // The first answer comes while the second move is still to be sent: asking the server now could show NIM-2 back in
    // To do, so the Board isn't refreshed yet.
    await act(async () => answers[0]!(issue(1, "Plan sprint", { status: inProgress })));
    await waitFor(() => expect(answers).toHaveLength(2));
    expect(issues.mock.calls.length).toBe(asked);
    expect(
      within(screen.getByRole("region", { name: "In progress" })).getByText("Fix login"),
    ).toBeTruthy();

    // The last answer refreshes it, once the server has both moves.
    all.forEach((item, index) => (all[index] = { ...item, status: inProgress }));
    await act(async () => answers[1]!(issue(2, "Fix login", { status: inProgress })));
    await waitFor(() => expect(issues.mock.calls.length).toBeGreaterThan(asked));
  });

  it("still refreshes the Board for an earlier move when the last of several quick moves fails", async () => {
    const all = [issue(1, "Plan sprint"), issue(2, "Fix login")];
    const issues = byStatus(all);
    const answers: { resolve: (moved: Issue) => void; reject: (error: Error) => void }[] = [];
    vi.spyOn(api, "moveIssue").mockImplementation(
      () => new Promise((resolve, reject) => answers.push({ resolve, reject })),
    );
    show("/projects/NIM/issues?view=board");
    await screen.findByRole("link", { name: /Fix login/ });
    const drop = (key: string) =>
      act(() =>
        dragEnd?.({ active: { id: key }, over: { data: { current: { status: statuses[1] } } } }),
      );

    drop("NIM-1");
    drop("NIM-2");
    await waitFor(() => expect(answers).toHaveLength(1));
    await act(async () => answers[0]!.resolve(issue(1, "Plan sprint", { status: inProgress })));
    await waitFor(() => expect(answers).toHaveLength(2));
    const asked = issues.mock.calls.length;

    // NIM-1's move worked and hasn't refreshed the Board yet; NIM-2's failing last must not leave it unrefreshed.
    all[0] = { ...all[0]!, status: inProgress };
    await act(async () => answers[1]!.reject(new Error("Offline")));
    await waitFor(() => expect(issues.mock.calls.length).toBeGreaterThan(asked));
  });

  it("says when the Board couldn't be refreshed, keeps the cards, and Try again asks again", async () => {
    const issues = byStatus([issue(1, "Plan sprint")]);
    vi.spyOn(api, "moveIssue").mockResolvedValue(issue(1, "Plan sprint", { status: inProgress }));
    show("/projects/NIM/issues?view=board");
    await screen.findByRole("link", { name: /Plan sprint/ });

    // The refresh after the move fails: the Board keeps what it showed and says so.
    issues.mockRejectedValue(new Error("Offline"));
    act(() =>
      dragEnd?.({ active: { id: "NIM-1" }, over: { data: { current: { status: statuses[1] } } } }),
    );
    expect(await screen.findByText("Couldn't refresh these Issues.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Plan sprint/ })).toBeTruthy();

    issues.mockImplementation(async () => page([issue(1, "Plan sprint", { status: inProgress })]));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText("Couldn't refresh these Issues.")).toBeNull());
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

  describe("reordering within a column", () => {
    const three = () => [issue(1, "Plan sprint"), issue(2, "Fix login"), issue(3, "Ship it")];
    /** Ends a drag of `key` over the card `over`, which is in the same column. */
    const dropOn = (key: string, over: Issue) =>
      act(() =>
        dragEnd?.({
          active: { id: key },
          over: { data: { current: { status: over.status, issue: over } } },
        }),
      );
    const titles = (column: string) =>
      within(screen.getByRole("region", { name: column }))
        .getAllByRole("link")
        .map((link) => link.textContent ?? "");

    it("sends the keys of the cards it was dropped between and shows it there before the server answers", async () => {
      const all = three();
      byStatus(all);
      // Never answers, so only the Board's own update can have moved the card.
      const reorder = vi.spyOn(api, "reorderIssue").mockReturnValue(new Promise(() => {}));
      const move = vi.spyOn(api, "moveIssue");
      show("/projects/NIM/issues?view=board");
      await screen.findByRole("link", { name: /Ship it/ });

      // NIM-3 dropped on NIM-1 (the top): before NIM-1, nothing above.
      await dropOn("NIM-3", all[0]!);
      await waitFor(() => expect(reorder).toHaveBeenCalledWith("NIM-3", undefined, "NIM-1"));
      await waitFor(() =>
        expect(
          titles("To do").map((text) => /Ship it|Plan sprint|Fix login/.exec(text)?.[0]),
        ).toEqual(["Ship it", "Plan sprint", "Fix login"]),
      );
      expect(move).not.toHaveBeenCalled();
    });

    it("sends both neighbours for a drop between two cards, and only `after` at the bottom", async () => {
      const all = three();
      byStatus(all);
      const reorder = vi.spyOn(api, "reorderIssue").mockResolvedValue(issue(1, "Plan sprint"));
      show("/projects/NIM/issues?view=board");
      await screen.findByRole("link", { name: /Ship it/ });

      // NIM-1 dropped on NIM-2: it takes NIM-2's place, between NIM-2 and NIM-3.
      await dropOn("NIM-1", all[1]!);
      await waitFor(() => expect(reorder).toHaveBeenCalledWith("NIM-1", "NIM-2", "NIM-3"));
      // Now NIM-2, NIM-1, NIM-3: NIM-2 dropped on the last card goes to the bottom.
      await dropOn("NIM-2", all[2]!);
      await waitFor(() => expect(reorder).toHaveBeenCalledWith("NIM-2", "NIM-3", undefined));
    });

    it("sends quick drops one after another, in the order they were made", async () => {
      const all = three();
      byStatus(all);
      const answers: ((saved: Issue) => void)[] = [];
      const reorder = vi
        .spyOn(api, "reorderIssue")
        .mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
      show("/projects/NIM/issues?view=board");
      await screen.findByRole("link", { name: /Ship it/ });

      await dropOn("NIM-3", all[0]!);
      await dropOn("NIM-2", all[0]!);

      // The second drop is held until the first has been answered, so the server applies them in order.
      await waitFor(() => expect(answers).toHaveLength(1));
      expect(reorder).toHaveBeenCalledTimes(1);
      await act(async () => answers[0]!(issue(3, "Ship it")));
      await waitFor(() => expect(reorder).toHaveBeenCalledTimes(2));
      expect(reorder).toHaveBeenNthCalledWith(1, "NIM-3", undefined, "NIM-1");
    });

    it("puts the card back, with a message, when the server refuses", async () => {
      const all = three();
      byStatus(all);
      const error = vi.spyOn(toast, "error");
      vi.spyOn(api, "reorderIssue").mockRejectedValue(new Error("Archived"));
      show("/projects/NIM/issues?view=board");
      await screen.findByRole("link", { name: /Ship it/ });

      await dropOn("NIM-3", all[0]!);

      await waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining("NIM-3")));
      await waitFor(() =>
        expect(
          titles("To do").map((text) => /Ship it|Plan sprint|Fix login/.exec(text)?.[0]),
        ).toEqual(["Plan sprint", "Fix login", "Ship it"]),
      );
    });

    it("does nothing when a card is dropped on itself", async () => {
      const all = three();
      byStatus(all);
      const reorder = vi.spyOn(api, "reorderIssue");
      show("/projects/NIM/issues?view=board");
      await screen.findByRole("link", { name: /Ship it/ });

      await dropOn("NIM-2", all[1]!);

      expect(reorder).not.toHaveBeenCalled();
    });

    it("still moves a card dropped on a card of another column", async () => {
      const all = [issue(1, "Plan sprint"), issue(2, "Fix login", { status: inProgress })];
      byStatus(all);
      const reorder = vi.spyOn(api, "reorderIssue");
      const move = vi
        .spyOn(api, "moveIssue")
        .mockResolvedValue(issue(1, "Plan sprint", { status: inProgress }));
      show("/projects/NIM/issues?view=board");
      await screen.findByRole("link", { name: /Fix login/ });

      await dropOn("NIM-1", all[1]!);

      await waitFor(() => expect(move).toHaveBeenCalledWith("NIM-1", "s2"));
      expect(reorder).not.toHaveBeenCalled();
    });

    it("keeps cards the User may not move from being dragged", async () => {
      vi.spyOn(api, "myProjectPermissions").mockResolvedValue({});
      byStatus(three());
      show("/projects/NIM/issues?view=board");

      const card = await screen.findByRole("link", { name: /Plan sprint/ });

      expect(card.getAttribute("aria-disabled")).toBe("true");
    });
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
  it("picks a value in the Filter menu, shows it as a token with its count, and the token's × removes it", async () => {
    const issues = vi.spyOn(api, "issues").mockResolvedValue(page([issue(1, "A")]));
    vi.spyOn(api, "issueCounts").mockResolvedValue({
      ...noCounts,
      total: 1,
      types: { Story: 6, Bug: 3 },
    });
    show("/projects/NIM/issues?view=table");
    await screen.findByText("A");

    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    fireEvent.click(await screen.findByRole("tab", { name: "Type", hidden: true }));
    // jsdom gives the button no size, so the menu's positioning keeps it hidden from role queries.
    const bug = await screen.findByRole("radio", { name: /Bug/, hidden: true });
    expect(bug.textContent).toContain("3");
    fireEvent.click(bug);

    await waitFor(() =>
      expect(issues).toHaveBeenLastCalledWith("NIM", expect.objectContaining({ type: "Bug" })),
    );
    const tokens = screen.getByRole("group", { name: "Applied filters" });
    expect(within(tokens).getByText("Type is")).toBeTruthy();
    expect(screen.getByLabelText("1 applied")).toBeTruthy();
    // Picking the chosen value again clears it.
    fireEvent.click(screen.getByRole("radio", { name: /Bug/, hidden: true }));
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Applied filters" })).toBeNull(),
    );
  });

  it("removes one filter with its token's ×", async () => {
    const issues = vi.spyOn(api, "issues").mockResolvedValue(page([issue(1, "A")]));
    show("/projects/NIM/issues?view=table&type=Bug&priority=High");
    await screen.findByText("A");

    fireEvent.click(screen.getByRole("button", { name: "Remove Type filter" }));

    await waitFor(() =>
      expect(issues).toHaveBeenLastCalledWith("NIM", { priority: "High", size: 50 }),
    );
  });

  it("shows how many Issues match, as one issue or many", async () => {
    vi.spyOn(api, "issues").mockResolvedValue(page([issue(1, "A")]));
    vi.spyOn(api, "issueCounts").mockResolvedValue({ ...noCounts, total: 1 });
    show("/projects/NIM/issues?view=table");

    expect(await screen.findByText("1 issue")).toBeTruthy();
  });

  it("keeps every Board column for a Status filter, asking only for that Status's Issues", async () => {
    const issues = byStatus([issue(2, "Fix login", { status: inProgress })]);
    show("/projects/NIM/issues?view=board&status=In%20progress");

    await screen.findByRole("link", { name: /Fix login/ });
    expect(screen.getByRole("region", { name: "To do" })).toBeTruthy();
    const asked = issues.mock.calls.map(([, search]) => search.status);
    expect(asked).toContain("In progress");
    expect(asked).not.toContain("To do");
  });

  it("says a search matched nothing, and Clear search clears only the search", async () => {
    const issues = vi.spyOn(api, "issues").mockResolvedValue(page([]));
    show("/projects/NIM/issues?view=table&type=Bug&q=zzz");

    // Filters and a search: the filters are named first.
    expect(await screen.findByText("No issues match these filters")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("No issues match “zzz”")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    await waitFor(() => expect(issues).toHaveBeenLastCalledWith("NIM", { size: 50 }));
  });

  it("adds an Issue straight into a Board column's Status", async () => {
    byStatus([issue(1, "Plan sprint")]);
    const created = vi
      .spyOn(api, "createIssue")
      .mockResolvedValue(issue(3, "Straight in", { status: inProgress }));
    show("/projects/NIM/issues?view=board");
    await screen.findByRole("link", { name: /Plan sprint/ });

    fireEvent.click(screen.getByRole("button", { name: "Add issue to In progress" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("In Nimbus · In progress")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/^Title/), { target: { value: "Straight in" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Create Issue/ }));

    await waitFor(() =>
      expect(created).toHaveBeenCalledWith("NIM", expect.objectContaining({ statusId: "s2" })),
    );
  });

  it("offers no Add issue and says why in an Archived project", async () => {
    vi.spyOn(api, "project").mockResolvedValue({ ...project, archived: true });
    byStatus([issue(1, "Plan sprint")]);
    show("/projects/NIM/issues?view=board");

    await screen.findByRole("link", { name: /Plan sprint/ });
    expect(screen.getByText("Archived · read-only")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add issue/ })).toBeNull();
  });

  it("focuses the search with /", async () => {
    vi.spyOn(api, "issues").mockResolvedValue(page([issue(1, "A")]));
    show("/projects/NIM/issues?view=table");
    await screen.findByText("A");

    fireEvent.keyDown(document.body, { key: "/" });

    expect(document.activeElement).toBe(screen.getByLabelText("Search issues"));
  });
  it("empties the other columns when a Status filter is chosen after they loaded", async () => {
    byStatus([issue(1, "Plan sprint"), issue(2, "Fix login", { status: inProgress })]);
    show("/projects/NIM/issues?view=board");
    await screen.findByRole("link", { name: /Plan sprint/ });

    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /In progress/, hidden: true }));

    await waitFor(() => expect(screen.queryByRole("link", { name: /Plan sprint/ })).toBeNull());
    expect(screen.getByRole("link", { name: /Fix login/ })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "To do" })).getByText("0")).toBeTruthy();
  });

  it("says why an Issue couldn't be added when its column's Status is gone", async () => {
    byStatus([issue(1, "Plan sprint")]);
    vi.spyOn(api, "createIssue").mockRejectedValue(
      new ApiError(400, "Invalid fields", { statusId: "Choose one of the project's Statuses" }),
    );
    show("/projects/NIM/issues?view=board");
    await screen.findByRole("link", { name: /Plan sprint/ });

    fireEvent.click(screen.getByRole("button", { name: "Add issue to In progress" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^Title/), { target: { value: "Late" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Create Issue/ }));

    expect(await within(dialog).findByText("Choose one of the project's Statuses")).toBeTruthy();
  });
});
