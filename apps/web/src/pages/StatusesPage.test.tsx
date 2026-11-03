// @vitest-environment jsdom
import { ApiError } from "@repo/api";
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
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
import StatusesPage from "./StatusesPage";

const project: Project = {
  id: "p1",
  key: "NIM",
  name: "Nimbus",
  description: null,
  archived: false,
  createdAt: "2026-10-19T00:00:00Z",
};
const statuses: ProjectStatus[] = [
  { id: "s1", name: "To do", category: "TODO", position: 0 },
  { id: "s2", name: "In progress", category: "IN_PROGRESS", position: 1 },
  { id: "s3", name: "Done", category: "DONE", position: 2 },
];
const issuesIn = (total: number): IssuePage => ({ items: [], total, page: 0, size: 1 });

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
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
        <MemoryRouter initialEntries={["/projects/NIM/settings/statuses"]}>
          <Routes>
            <Route path="/projects/:key/settings/statuses" element={<StatusesPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </NimbusThemeProvider>,
  );
}

describe("StatusesPage", () => {
  it("lists the Statuses in order with their categories", async () => {
    show();
    const names = await screen.findAllByLabelText(/^Name of /);
    expect(names.map((input) => (input as HTMLInputElement).value)).toEqual([
      "To do",
      "In progress",
      "Done",
    ]);
    expect(screen.getAllByLabelText("Category of In progress")[0]).toHaveProperty(
      "value",
      "In progress",
    );
  });

  it("adds a Status in the chosen category and shows a refused name on its field", async () => {
    const add = vi
      .spyOn(api, "addStatus")
      .mockRejectedValueOnce(
        new ApiError(409, "A Status named Done already exists", {}, null, "status_name_taken"),
      )
      .mockResolvedValueOnce({ id: "s4", name: "QA", category: "TODO", position: 1 });
    show();
    const field = await screen.findByLabelText("New Status");
    fireEvent.change(field, { target: { value: " Done " } });
    fireEvent.click(screen.getByRole("button", { name: "Add Status" }));
    expect(await screen.findByText("A Status named Done already exists")).toBeTruthy();
    expect(add).toHaveBeenCalledWith("NIM", { name: "Done", category: "TODO" });

    fireEvent.change(field, { target: { value: "QA" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Status" }));
    await waitFor(() =>
      expect(add).toHaveBeenLastCalledWith("NIM", { name: "QA", category: "TODO" }),
    );
    await waitFor(() => expect((field as HTMLInputElement).value).toBe(""));
  });

  it("renames in place when the name loses focus and puts the old name back on Escape", async () => {
    const edit = vi
      .spyOn(api, "editStatus")
      .mockResolvedValue({ id: "s1", name: "Backlog", category: "TODO", position: 0 });
    show();
    const name = (await screen.findByLabelText("Name of To do")) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Backlog" } });
    fireEvent.blur(name);
    await waitFor(() => expect(edit).toHaveBeenCalledWith("NIM", "s1", { name: "Backlog" }));

    const other = (await screen.findByLabelText("Name of In progress")) as HTMLInputElement;
    fireEvent.change(other, { target: { value: "Changed" } });
    fireEvent.keyDown(other, { key: "Escape" });
    expect(other.value).toBe("In progress");
    fireEvent.blur(other);
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it("changes a category", async () => {
    const edit = vi
      .spyOn(api, "editStatus")
      .mockResolvedValue({ id: "s2", name: "In progress", category: "DONE", position: 1 });
    show();
    fireEvent.click(await screen.findByRole("combobox", { name: "Category of In progress" }));
    const listbox = (await screen.findAllByRole("listbox", { hidden: true })).find(
      (candidate) => candidate.getAttribute("aria-label") === "Category of In progress",
    )!;
    fireEvent.click(within(listbox).getByRole("option", { name: "Done", hidden: true }));
    await waitFor(() => expect(edit).toHaveBeenCalledWith("NIM", "s2", { category: "DONE" }));
  });

  it("saves the order a row is dragged to", async () => {
    const reorder = vi.spyOn(api, "reorderStatuses").mockResolvedValue([]);
    show();
    await screen.findByLabelText("Name of To do");
    await act(async () => dragEnd?.({ active: { id: "s1" }, over: { id: "s3" } }));
    await waitFor(() => expect(reorder).toHaveBeenCalledWith("NIM", ["s2", "s3", "s1"]));
  });

  it("deletes a Status without Issues straight away", async () => {
    vi.mocked(api.projectStatuses).mockResolvedValue([
      ...statuses,
      { id: "s4", name: "QA", category: "DONE", position: 3 },
    ]);
    const remove = vi.spyOn(api, "deleteStatus").mockResolvedValue(undefined);
    show();
    fireEvent.click(await screen.findByLabelText("Delete QA"));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("No Issues are in this Status.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("NIM", "s4", undefined));
  });

  it("asks where the Issues go when the Status has some", async () => {
    vi.mocked(api.issues).mockResolvedValue(issuesIn(3));
    const remove = vi.spyOn(api, "deleteStatus").mockResolvedValue(undefined);
    show();
    fireEvent.click(await screen.findByLabelText("Delete To do"));
    const dialog = await screen.findByRole("dialog");
    // To do is the only Status of its category, so it can't go until another is added.
    expect(within(dialog).getByText(/at least one Status in each category/)).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Delete" })).toHaveProperty("disabled", true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(remove).not.toHaveBeenCalled();
  });

  it("sends the chosen destination, the same category's first Status by default", async () => {
    vi.mocked(api.projectStatuses).mockResolvedValue([
      ...statuses,
      { id: "s4", name: "QA", category: "DONE", position: 3 },
    ]);
    vi.mocked(api.issues).mockResolvedValue(issuesIn(2));
    const remove = vi.spyOn(api, "deleteStatus").mockResolvedValue(undefined);
    show();
    fireEvent.click(await screen.findByLabelText("Delete QA"));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText(/2 Issues are in this Status/);
    expect(within(dialog).getAllByLabelText("Move Issues to")[0]).toHaveProperty("value", "Done");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("NIM", "s4", "s3"));
  });

  it("is read-only for an Archived project", async () => {
    vi.mocked(api.project).mockResolvedValue({ ...project, archived: true });
    show();
    expect(await screen.findByText("This project is archived")).toBeTruthy();
    expect(screen.getByLabelText("Name of To do")).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: "Add Status" })).toBeNull();
  });
});
