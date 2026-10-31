// @vitest-environment jsdom
import { ApiError } from "@repo/api";
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { toast } from "@repo/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type Project } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import ProjectsPage from "./ProjectsPage";

const apple: Project = {
  id: "p1",
  key: "APP",
  name: "apple",
  description: "Fruit stand",
  archived: false,
  createdAt: "2026-10-19T00:00:00Z",
};
const nimbus: Project = { ...apple, id: "p2", key: "NIM", name: "Nimbus", description: null };

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

const newProject = () => screen.getByRole("button", { name: "+ New project" });
const openForm = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "+ New project" }));
  return screen.findByLabelText(/^Name/);
};
const create = () => fireEvent.click(screen.getByRole("button", { name: /Create project/ }));

describe("the Projects page: the list", () => {
  it("lists the projects as links to their pages, with their keys and descriptions", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([apple, nimbus]);
    show();

    expect((await screen.findByText("apple")).closest("a")?.getAttribute("href")).toBe(
      "/projects/APP",
    );
    expect(screen.getByText("APP")).toBeTruthy();
    expect(screen.getByText("Fruit stand")).toBeTruthy();
    expect(screen.getByText("Nimbus").closest("a")?.getAttribute("href")).toBe("/projects/NIM");
    expect(screen.getByRole("list", { name: "Your projects" }).children.length).toBe(2);
  });

  it("says there are no projects to show, without saying anything about membership", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([]);
    show();

    expect(
      await screen.findByText("No projects to show yet. Create one to get started."),
    ).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Your projects" })).toBeNull();
  });

  it("shows the server-error page, with Try again, when the first load fails", async () => {
    const projects = vi.spyOn(api, "projects").mockRejectedValueOnce(new ApiError(500, "boom"));
    show();

    expect(await screen.findByText("Something went wrong on our side.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ New project" })).toBeNull();

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
    expect(await screen.findByText("Couldn't refresh your projects")).toBeTruthy();

    projects.mockResolvedValue([apple, nimbus]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Nimbus")).toBeTruthy();
    expect(screen.queryByText("Couldn't refresh your projects")).toBeNull();
  });
});

describe("the Projects page: New project", () => {
  it("is offered only once the list has loaded", async () => {
    let finish: (projects: Project[]) => void = () => {};
    vi.spyOn(api, "projects").mockReturnValue(new Promise((resolve) => (finish = resolve)));
    show();

    expect(screen.queryByRole("button", { name: "+ New project" })).toBeNull();
    finish([apple]);
    expect(await screen.findByRole("button", { name: "+ New project" })).toBeTruthy();
  });

  it("opens the form with Name focused, and Cancel closes it and puts focus back on New project", async () => {
    vi.spyOn(api, "projects").mockResolvedValue([apple]);
    show();

    expect(document.activeElement).toBe(document.body);
    const name = await openForm();
    expect(document.activeElement).toBe(name);
    expect(screen.queryByRole("button", { name: "+ New project" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText(/^Name/)).toBeNull();
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
