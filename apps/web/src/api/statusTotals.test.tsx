// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, type Issue, type ProjectIssueStats, type ProjectStatus } from "./client";
import {
  queryKeys,
  useIssueChanged,
  useMoveIssue,
  useProjectIssueStats,
  useReorderIssue,
} from "./queries";
import { createQueryClient } from "./queryClient";

const dana = { id: "u1", displayName: "Dana", avatarUrl: null };
const todo = { id: "s1", name: "To do", category: "TODO" as const };
const done: ProjectStatus = {
  id: "s3",
  name: "Done",
  category: "DONE",
  position: 2,
  isDefault: false,
};
const issue: Issue = {
  id: "i1",
  key: "NIM-1",
  number: 1,
  type: "Story",
  title: "Plan sprint",
  description: null,
  priority: "Medium",
  status: todo,
  reporter: dana,
  assignee: null,
  createdAt: "2026-10-19T00:00:00Z",
  updatedAt: "2026-10-19T00:00:00Z",
  version: 0,
};
const totals: ProjectIssueStats[] = [
  { projectKey: "NIM", total: 4, done: 1, updatedAt: "2026-10-19T00:00:00Z" },
  { projectKey: "OTH", total: 2, done: 0, updatedAt: "2026-10-19T00:00:00Z" },
];

function setup() {
  const client = createQueryClient();
  client.setQueryData(queryKeys.projectIssueStats, totals);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const shown = () => client.getQueryData<ProjectIssueStats[]>(queryKeys.projectIssueStats)!;
  return { client, wrapper, shown };
}

afterEach(() => vi.restoreAllMocks());

// The Projects table's Progress comes from these totals; going back to it must not show them as they were.
describe("the Projects totals after a Status change", () => {
  it("count a Board drop into a Done column before the server answers", async () => {
    vi.spyOn(api, "reorderIssue").mockReturnValue(new Promise(() => {}));
    const { wrapper, shown } = setup();
    const { result } = renderHook(() => useReorderIssue(), { wrapper });

    act(() => void result.current(issue, undefined, undefined, done));

    expect(shown()[0]).toMatchObject({ projectKey: "NIM", done: 2 });
    expect(shown()[0]!.updatedAt).not.toBe(totals[0]!.updatedAt);
    expect(shown()[1]).toEqual(totals[1]);
  });

  it("count a move out of Done, and ask the server again when it fails", async () => {
    vi.spyOn(api, "moveIssue").mockRejectedValue(new Error("Archived"));
    const { client, wrapper, shown } = setup();
    const refresh = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useMoveIssue(), { wrapper });

    await act(async () => {
      await result
        .current({ ...issue, status: done }, { ...todo, position: 0, isDefault: true })
        .catch(() => {});
    });

    expect(shown()[0]!.done).toBe(0);
    expect(refresh).toHaveBeenCalledWith({ queryKey: queryKeys.projectIssueStats });
  });

  it("count a Status chosen on the Issue page", () => {
    const { client, wrapper, shown } = setup();
    client.setQueryData(queryKeys.issue(issue.key), issue);
    const { result } = renderHook(() => useIssueChanged(), { wrapper });

    act(() => result.current({ ...issue, status: done }));

    expect(shown()[0]!.done).toBe(2);
  });

  it("aren't fetched while a drop is on its way, so Projects never shows them from before it", async () => {
    let answer: (saved: Issue) => void = () => {};
    vi.spyOn(api, "reorderIssue").mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    );
    const fetched = vi
      .spyOn(api, "projectIssueStats")
      .mockResolvedValue([{ ...totals[0]!, done: 2 }, totals[1]!]);
    const { wrapper, shown } = setup();
    const drop = renderHook(() => useReorderIssue(), { wrapper });
    act(() => void drop.result.current(issue, undefined, undefined, done));

    // Back on Projects before the server has answered: the counted totals stay, and nothing is asked yet.
    renderHook(() => useProjectIssueStats(), { wrapper });
    await act(async () => {});
    expect(fetched).not.toHaveBeenCalled();
    expect(shown()[0]!.done).toBe(2);

    // Once answered, the totals are asked for once.
    await act(async () =>
      answer({ ...issue, status: { id: done.id, name: done.name, category: "DONE" } }),
    );
    await vi.waitFor(() => expect(fetched).toHaveBeenCalledTimes(1));
    expect(shown()[0]!.done).toBe(2);
  });

  it("leave them alone for a drop within a column", () => {
    vi.spyOn(api, "reorderIssue").mockReturnValue(new Promise(() => {}));
    const { wrapper, shown } = setup();
    const { result } = renderHook(() => useReorderIssue(), { wrapper });

    act(() => void result.current(issue, undefined, undefined));

    expect(shown()).toEqual(totals);
  });
});
