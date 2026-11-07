// @vitest-environment jsdom
import { ApiError } from "@repo/api";
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { toast } from "@repo/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type Project, type ProjectIssueStats } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import ProjectsPage from "./ProjectsPage";

const apple: Project = {
  id: "p1",
  key: "APP",
  name: "apple",
  description: "Fruit stand",
  archived: false,
  createdAt: "2026-10-19T00:00:00Z",
  createdBy: { id: "u1", displayName: "Dana", avatarUrl: null },
  memberCount: 1,
  members: [{ id: "u1", displayName: "Dana", avatarUrl: null }],
};
const nimbus: Project = { ...apple, id: "p2", key: "NIM", name: "Nimbus", description: null };

/** A project's Issue totals: `total` Issues, `done` of them in a Done Status, last changed `updatedAt`. */
const stats = (
  projectKey: string,
  total: number,
  done: number,
  updatedAt: string | null = null,
): ProjectIssueStats => ({ projectKey, total, done, updatedAt });

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
  // Mantine measures itself, and jsdom can't.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreMatchMedia();
});

/** The page as the app draws it, in a cache that outlives it, as the app's does. */
function show(client = createQueryClient()) {
  return render(
    <NimbusThemeProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ProjectsPage />
        </MemoryRouter>
      </QueryClientProvider>
    </NimbusThemeProvider>,
  );
}

const newProject = () => screen.getByRole("button", { name: "New project" });
const openForm = async () => {
  const button = await screen.findByRole("button", { name: "New project" });
  // A real click focuses the button, which the window hands focus back to when it closes.
  button.focus();
  fireEvent.click(button);
  return screen.findByLabelText(/^Name/);
};
const create = () => fireEvent.click(screen.getByRole("button", { name: /Create project/ }));

describe("the Projects page: the list", () => {
  it("lists the projects as links to their pages, with their keys and descriptions", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([apple, nimbus]);
    vi.spyOn(api, "projectIssueStats").mockResolvedValue([]);
    show();

    expect((await screen.findByText("apple")).closest("a")?.getAttribute("href")).toBe(
      "/projects/APP",
    );
    expect(screen.getAllByText("APP").length).toBeGreaterThan(0);
    expect(screen.getByText("Fruit stand")).toBeTruthy();
    expect(screen.getByText("Nimbus").closest("a")?.getAttribute("href")).toBe("/projects/NIM");
    const table = screen.getByRole("table", { name: "Your projects" });
    expect(within(table).getAllByRole("row").length).toBe(3);
    expect(screen.getByText("2 projects")).toBeTruthy();
  });

  it("shows each project's creator, open Issues, how many are done and when it last changed", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([{ ...apple, memberCount: 4 }, nimbus]);
    const issueStats = vi
      .spyOn(api, "projectIssueStats")
      .mockResolvedValue([stats("APP", 8, 2, new Date().toISOString()), stats("NIM", 0, 0)]);
    show();

    const appleRow = (await screen.findByText("apple")).closest("tr")!;
    expect(await within(appleRow).findByText("6")).toBeTruthy();
    expect(within(appleRow).getByText("25%")).toBeTruthy();
    expect(
      within(appleRow)
        .getByRole("progressbar", { name: "apple progress" })
        .getAttribute("aria-valuenow"),
    ).toBe("25");
    expect(within(appleRow).getAllByText("Dana").length).toBeGreaterThan(0);
    expect(within(appleRow).getByText("Dana and 3 more")).toBeTruthy();
    expect(within(appleRow).getByText("+3")).toBeTruthy();
    expect(within(appleRow).getByText(/ago$/)).toBeTruthy();
    const nimbusRow = screen.getByText("Nimbus").closest("tr")!;
    expect(await within(nimbusRow).findByText("No issues")).toBeTruthy();
    // One request for every project's totals, not one per project.
    expect(issueStats).toHaveBeenCalledTimes(1);
  });

  it("narrows the table to the projects matching the search, by name, key or description", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([apple, nimbus]);
    vi.spyOn(api, "projectIssueStats").mockResolvedValue([]);
    show();

    const search = await screen.findByRole("textbox", { name: "Search projects" });
    fireEvent.change(search, { target: { value: "fruit" } });
    expect(screen.getByText("apple")).toBeTruthy();
    expect(screen.queryByText("Nimbus")).toBeNull();
    expect(screen.getByText("1 project")).toBeTruthy();

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByText("No projects match “zzz”.")).toBeTruthy();
  });

  it("says there are no projects to show, without saying anything about membership", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([]);
    show();

    expect(
      await screen.findByText("No projects to show yet. Create one to get started."),
    ).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Your projects" })).toBeNull();
  });

  it("shows the server-error page, with Try again, when the first load fails", async () => {
    const projects = vi.spyOn(api, "projects").mockRejectedValueOnce(new ApiError(500, "boom"));
    show();

    expect(await screen.findByText("Something went wrong on our side.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New project" })).toBeNull();

    projects.mockResolvedValue([apple]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("apple")).toBeTruthy();
  });

  it("keeps the list it had when a refresh fails, and says so, with Try again", async () => {
    const projects = vi.spyOn(api, "projects").mockResolvedValueOnce([apple]);
    const client = createQueryClient();
    const first = show(client);
    await screen.findByText("apple");
    first.unmount();

    projects.mockRejectedValueOnce(new ApiError(500, "boom"));
    show(client);
    expect(screen.getByText("apple")).toBeTruthy();
    expect(await screen.findByText("Couldn't refresh your projects.")).toBeTruthy();

    projects.mockResolvedValue([apple, nimbus]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Nimbus")).toBeTruthy();
    expect(screen.queryByText("Couldn't refresh your projects.")).toBeNull();
  });
});

describe("the Projects page: New project", () => {
  it("is offered only once the list has loaded", async () => {
    let finish: (projects: Project[]) => void = () => {};
    vi.spyOn(api, "projects").mockReturnValue(new Promise((resolve) => (finish = resolve)));
    show();

    expect(screen.queryByRole("button", { name: "New project" })).toBeNull();
    finish([apple]);
    expect(await screen.findByRole("button", { name: "New project" })).toBeTruthy();
  });

  it("opens the window with Name focused, and Cancel closes it and puts focus back on New project", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([apple]);
    show();

    expect(document.activeElement).toBe(document.body);
    const name = await openForm();
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(screen.getByRole("dialog", { name: "New project" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByLabelText(/^Name/)).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(newProject()));
  });

  it("suggests the key from the name and creates the project with what was typed", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([]);
    const created = vi
      .spyOn(api, "createProject")
      .mockResolvedValue({ ...nimbus, key: "NW", name: "Nimbus Web" });
    show();

    fireEvent.change(await openForm(), { target: { value: "Nimbus Web" } });
    expect((screen.getByLabelText(/^Project key/) as HTMLInputElement).value).toBe("NW");
    // The server cleans the description, so the form sends it as typed.
    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: " About it " } });
    create();

    await waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    expect(created).toHaveBeenCalledWith({
      name: "Nimbus Web",
      key: "NW",
      description: " About it ",
    });
  });

  it("checks a field when the User leaves it, and clears the error as soon as it is fixed", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([apple]);
    show();

    const name = await openForm();
    fireEvent.blur(name);
    expect(await screen.findByText("Enter a name.")).toBeTruthy();
    fireEvent.change(name, { target: { value: "N" } });
    expect(screen.queryByText("Enter a name.")).toBeNull();

    const key = screen.getByLabelText(/^Project key/);
    fireEvent.change(key, { target: { value: "1A" } });
    // Not while typing: only once the User leaves the field.
    expect(screen.queryByText(/Use 2 to 10 letters or digits/)).toBeNull();
    fireEvent.blur(key);
    expect(
      await screen.findByText("Use 2 to 10 letters or digits, starting with a letter."),
    ).toBeTruthy();
    expect(screen.queryByText(/Suggested from the name/)).toBeNull();
    fireEvent.change(key, { target: { value: "NW" } });
    expect(screen.queryByText(/Use 2 to 10 letters or digits/)).toBeNull();
    expect(screen.getByText(/Suggested from the name/)).toBeTruthy();
  });

  it("says at once that a key one of the User's projects has is taken, before anything is sent", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([apple]);
    const created = vi.spyOn(api, "createProject");
    show();

    // The name suggests APP, which "apple" already has.
    fireEvent.change(await openForm(), { target: { value: "Application" } });
    expect(await screen.findByText("APP is already used by one of your projects.")).toBeTruthy();
    create();
    expect(created).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Project key/), { target: { value: "APX" } });
    expect(screen.queryByText(/already used/)).toBeNull();
  });

  it("doesn't send a form the window can already tell is wrong", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([apple]);
    const created = vi.spyOn(api, "createProject");
    show();

    fireEvent.change(await openForm(), { target: { value: "Nimbus Web" } });
    fireEvent.change(screen.getByLabelText(/^Description/), {
      target: { value: "x".repeat(1001) },
    });
    create();

    expect(await screen.findByText("Keep it to 1000 characters.")).toBeTruthy();
    expect(screen.getByText(/1,001 \/ 1000/)).toBeTruthy();
    expect(created).not.toHaveBeenCalled();
  });

  it("refreshes the list once the project is created", async () => {
    const projects = vi.spyOn(api, "projects").mockResolvedValue([]);
    vi.spyOn(api, "createProject").mockResolvedValue({ ...nimbus, key: "NW", name: "Nimbus Web" });
    show();

    fireEvent.change(await openForm(), { target: { value: "Nimbus Web" } });
    create();

    await waitFor(() => expect(projects).toHaveBeenCalledTimes(2));
  });

  it("shows a server error on its field and keeps the form open with what was typed", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([apple]);
    vi.spyOn(api, "createProject").mockRejectedValue(
      new ApiError(409, "This Project key is already taken", {
        key: "This Project key is already taken",
      }),
    );
    show();

    fireEvent.change(await openForm(), { target: { value: "Apple Pie" } });
    create();

    expect(await screen.findByText("This Project key is already taken")).toBeTruthy();
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe("Apple Pie");
  });

  it("says so with a toast when the project can't be created and the User has already left", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([apple]);
    let fail: (error: Error) => void = () => {};
    vi.spyOn(api, "createProject").mockReturnValue(new Promise((_, reject) => (fail = reject)));
    const error = vi.spyOn(toast, "error");
    const page = show();

    fireEvent.change(await openForm(), { target: { value: "Apple Pie" } });
    create();
    page.unmount();
    fail(new ApiError(409, "This Project key is already taken", { key: "taken" }));

    await waitFor(() => expect(error).toHaveBeenCalledWith("This Project key is already taken"));
  });
});
