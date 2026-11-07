// @vitest-environment jsdom
import { ApiError } from "@repo/api";
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { toast } from "@repo/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The drag itself needs a real layout; the tests end it by hand with the handler the page gave dnd-kit.
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
import { api, type IssuePage, type Project, type ProjectStatus } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { SessionContext, type Session } from "../auth/useSession";
import StatusesPage from "./StatusesPage";
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
const status = (
  id: string,
  name: string,
  category: ProjectStatus["category"],
  position: number,
  isDefault = false,
): ProjectStatus => ({ id, name, category, position, isDefault });
// Two To do Statuses, the first of them the default; In progress and Done have one each.
const statuses: ProjectStatus[] = [
  status("s1", "To do", "TODO", 0, true),
  status("s4", "Triage", "TODO", 1),
  status("s2", "In progress", "IN_PROGRESS", 2),
  status("s3", "Done", "DONE", 3),
];
const counts = {
  total: 7,
  statuses: { s1: 2, s4: 1, s2: 1, s3: 3 },
  categories: { TODO: 3, IN_PROGRESS: 1, DONE: 3 },
  types: {},
  priorities: {},
};
const issuesIn = (total: number): IssuePage => ({ items: [], total, page: 0, size: 1 });

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
  Element.prototype.scrollIntoView = () => {};
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
  vi.spyOn(api, "issues").mockResolvedValue(issuesIn(0));
  vi.spyOn(api, "issueCounts").mockResolvedValue(counts);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreMatchMedia();
});

function show() {
  return render(
    <NimbusThemeProvider>
      <QueryClientProvider client={createQueryClient()}>
        <SessionContext value={session}>
          <MemoryRouter initialEntries={["/projects/NIM/settings/statuses"]}>
            <Routes>
              <Route path="/projects/:key" element={<ProjectLayout />}>
                <Route path="settings/statuses" element={<StatusesPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </SessionContext>
      </QueryClientProvider>
    </NimbusThemeProvider>,
  );
}

describe("StatusesPage", () => {
  const card = async (name: string) => within(await screen.findByRole("region", { name }));
  const openMenu = async (name: string) => {
    fireEvent.click(await screen.findByLabelText(`More actions for ${name}`));
  };
  const disabled = (element: HTMLElement) =>
    element.hasAttribute("disabled") || element.getAttribute("data-disabled") !== null;

  it("groups the Statuses under their categories with the Issue counts and marks the default", async () => {
    show();
    const todo = await card("To do");
    expect(await todo.findByText("· 3 issues")).toBeTruthy();
    expect(todo.getByText("Not started yet. New issues land in the default status.")).toBeTruthy();
    expect(
      todo.getAllByRole("button", { name: /^Rename / }).map((button) => button.textContent),
    ).toEqual(["To do", "Triage"]);
    // Only the default has the badge.
    expect(todo.getAllByText("Default")).toHaveLength(1);
    expect(todo.getByText("2 issues")).toBeTruthy();
    expect(todo.getByText("1 issue")).toBeTruthy();
    const done = await card("Done");
    expect(done.getByText("· 3 issues")).toBeTruthy();
    expect(done.getByText("Finished. Issues here count as closed.")).toBeTruthy();
  });

  it("adds a Status in a card and shows a refused name on its field", async () => {
    const add = vi
      .spyOn(api, "addStatus")
      .mockRejectedValueOnce(
        new ApiError(409, "A Status named Done already exists", {}, null, "status_name_taken"),
      )
      .mockResolvedValueOnce(status("s5", "QA", "IN_PROGRESS", 3));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Add status to In progress" }));
    const field = await screen.findByLabelText("Name of the new In progress status");
    fireEvent.change(field, { target: { value: " Done " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("A Status named Done already exists")).toBeTruthy();
    expect(add).toHaveBeenCalledWith("NIM", { name: "Done", category: "IN_PROGRESS" });

    fireEvent.change(field, { target: { value: "QA" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() =>
      expect(add).toHaveBeenLastCalledWith("NIM", { name: "QA", category: "IN_PROGRESS" }),
    );
    // Added: the row closes.
    await waitFor(() =>
      expect(screen.queryByLabelText("Name of the new In progress status")).toBeNull(),
    );
  });

  it("cancels adding with Escape without saving", async () => {
    const add = vi.spyOn(api, "addStatus");
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Add status to Done" }));
    const field = await screen.findByLabelText("Name of the new Done status");
    fireEvent.change(field, { target: { value: "Won't do" } });
    fireEvent.keyDown(field, { key: "Escape" });

    expect(screen.queryByLabelText("Name of the new Done status")).toBeNull();
    expect(add).not.toHaveBeenCalled();
  });

  it("renames in place on Enter and drops the change on Escape", async () => {
    const edit = vi
      .spyOn(api, "editStatus")
      .mockResolvedValue(status("s1", "Backlog", "TODO", 0, true));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Rename To do" }));
    const name = screen.getByLabelText("Name of To do") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Backlog" } });
    fireEvent.keyDown(name, { key: "Enter" });
    await waitFor(() => expect(edit).toHaveBeenCalledWith("NIM", "s1", { name: "Backlog" }));

    fireEvent.click(screen.getByLabelText("Edit Done"));
    const other = screen.getByLabelText("Name of Done") as HTMLInputElement;
    fireEvent.change(other, { target: { value: "Changed" } });
    fireEvent.keyDown(other, { key: "Escape" });
    expect(screen.queryByLabelText("Name of Done")).toBeNull();
    expect(screen.getByRole("button", { name: "Rename Done" }).textContent).toBe("Done");
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it("changes a category from the menu", async () => {
    const edit = vi.spyOn(api, "editStatus").mockResolvedValue(status("s4", "Triage", "DONE", 1));
    show();
    await openMenu("Triage");
    const sub = await screen.findByRole("menuitem", { name: /^Category/ });
    // The submenu opens with the right arrow, as for a keyboard user.
    fireEvent.keyDown(sub, { key: "ArrowRight" });
    // The items are in the page while the submenu fades in, which jsdom counts as hidden.
    const target = (await screen.findAllByRole("menuitem", { name: "Done", hidden: true })).at(-1)!;
    fireEvent.click(target);
    await waitFor(() => expect(edit).toHaveBeenCalledWith("NIM", "s4", { category: "DONE" }));
  });

  it("makes a To do Status the default, and offers it only for To do", async () => {
    const makeDefault = vi
      .spyOn(api, "makeDefaultStatus")
      .mockResolvedValue(status("s4", "Triage", "TODO", 1, true));
    show();
    await openMenu("Triage");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Set as default" }));
    await waitFor(() => expect(makeDefault).toHaveBeenCalledWith("NIM", "s4"));

    // In progress can't be the default.
    await openMenu("In progress");
    const item = await screen.findByRole("menuitem", { name: /Set as default/ });
    expect(disabled(item)).toBe(true);
    expect(within(item).getByText("To do only")).toBeTruthy();
  });

  it("saves the order a row is dragged to within its card", async () => {
    const reorder = vi.spyOn(api, "reorderStatuses").mockResolvedValue([]);
    const edit = vi.spyOn(api, "editStatus");
    show();
    await screen.findByRole("button", { name: "Rename To do" });
    await act(async () => dragEnd?.({ active: { id: "s1" }, over: { id: "s4" } }));
    await waitFor(() => expect(reorder).toHaveBeenCalledWith("NIM", ["s4", "s1", "s2", "s3"]));
    expect(edit).not.toHaveBeenCalled();
  });

  it("changes the category of a row dropped in another card, then saves the order", async () => {
    const edit = vi.spyOn(api, "editStatus").mockResolvedValue(status("s4", "Triage", "DONE", 1));
    const reorder = vi.spyOn(api, "reorderStatuses").mockResolvedValue([]);
    show();
    await screen.findByRole("button", { name: "Rename To do" });
    // Dropped on the Done card itself: it goes to the end of Done.
    await act(async () => dragEnd?.({ active: { id: "s4" }, over: { id: "category:DONE" } }));
    await waitFor(() => expect(edit).toHaveBeenCalledWith("NIM", "s4", { category: "DONE" }));
    await waitFor(() => expect(reorder).toHaveBeenCalledWith("NIM", ["s1", "s2", "s3", "s4"]));
  });

  it("shows a dropped row in its new card at once and puts it back, with a message, when the server refuses", async () => {
    // Never answers until told to, so only the page's own update can have moved the row.
    let refuse: (error: Error) => void = () => {};
    vi.spyOn(api, "editStatus").mockImplementation(
      () => new Promise((_, reject) => (refuse = reject)),
    );
    const error = vi.spyOn(toast, "error");
    show();
    await screen.findByRole("button", { name: "Rename To do" });

    await act(async () => dragEnd?.({ active: { id: "s4" }, over: { id: "category:DONE" } }));
    const done = within(screen.getByRole("region", { name: "Done" }));
    expect(done.getByRole("button", { name: "Rename Triage" })).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "To do" })).queryByRole("button", {
        name: "Rename Triage",
      }),
    ).toBeNull();

    await act(async () => refuse(new ApiError(409, "Nope", {}, null, null)));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Nope"));
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: "To do" })).getByRole("button", {
          name: "Rename Triage",
        }),
      ).toBeTruthy(),
    );
  });

  it("does nothing when a row is dropped where it was", async () => {
    const reorder = vi.spyOn(api, "reorderStatuses");
    show();
    await screen.findByRole("button", { name: "Rename To do" });
    await act(async () => dragEnd?.({ active: { id: "s1" }, over: { id: "s1" } }));
    expect(reorder).not.toHaveBeenCalled();
  });

  it("can't drag or delete the only Status of a category", async () => {
    show();
    expect(disabled(await screen.findByLabelText("Drag In progress"))).toBe(true);
    expect(disabled(screen.getByLabelText("Drag Triage"))).toBe(false);

    await openMenu("In progress");
    const remove = await screen.findByRole("menuitem", { name: "Delete…" });
    expect(disabled(remove)).toBe(true);
    expect(remove.getAttribute("title")).toBe("Each category needs at least one status.");
  });

  it("deletes a Status without Issues straight away", async () => {
    const remove = vi.spyOn(api, "deleteStatus").mockResolvedValue(undefined);
    show();
    await openMenu("Triage");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete “Triage”?")).toBeTruthy();
    expect(await within(dialog).findByText(/No issues are in this status/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("NIM", "s4", undefined));
  });

  it("asks where the Issues go, naming how many move", async () => {
    vi.mocked(api.issues).mockResolvedValue(issuesIn(2));
    const remove = vi.spyOn(api, "deleteStatus").mockResolvedValue(undefined);
    show();
    await openMenu("Triage");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete…" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(/2 issues are in this status/);
    // The first other Status of the same category is chosen.
    expect(within(dialog).getAllByLabelText("Move its issues to")[0]).toHaveProperty(
      "value",
      "To do",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete and move 2 issues" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("NIM", "s4", "s1"));
  });

  it("is read-only for an Archived project", async () => {
    vi.mocked(api.project).mockResolvedValue({ ...project, archived: true });
    show();
    expect(await screen.findByText("This project is archived")).toBeTruthy();
    expect(disabled(screen.getByRole("button", { name: "Rename To do" }))).toBe(true);
    expect(screen.queryByRole("button", { name: /Add status/ })).toBeNull();
    expect(screen.queryByLabelText("More actions for To do")).toBeNull();
  });

  it("tells a User who may not manage Statuses so", async () => {
    vi.spyOn(api, "myProjectPermissions").mockResolvedValue({});
    show();

    expect(await screen.findByText("You can't manage Statuses.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
  });
});
