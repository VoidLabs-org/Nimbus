// @vitest-environment jsdom
import { ApiError } from "@repo/api";
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type Project } from "../api/client";
import { queryKeys } from "../api/queries";
import { createQueryClient } from "../api/queryClient";
import ProjectPage from "./ProjectPage";

const apple: Project = {
  id: "p1",
  key: "APP",
  name: "apple",
  description: "Fruit stand",
  archived: false,
  createdAt: "2026-10-19T00:00:00Z",
};

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreMatchMedia();
});

/** The page at an address, in a cache that may already hold things. */
function showAt(path: string, client = createQueryClient()) {
  return render(
    <NimbusThemeProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/projects/:key" element={<ProjectPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </NimbusThemeProvider>,
  );
}

describe("a project's page", () => {
  it("shows its name, key and description", async () => {
    vi.spyOn(api, "project").mockResolvedValue(apple);
    showAt("/projects/app");

    expect((await screen.findAllByText("apple")).length).toBeGreaterThan(0);
    expect(screen.getByText("APP")).toBeTruthy();
    expect(screen.getByText("Fruit stand")).toBeTruthy();
  });

  it("says there is no description when it has none", async () => {
    vi.spyOn(api, "project").mockResolvedValue({ ...apple, description: null });
    showAt("/projects/APP");

    expect(await screen.findByText("No description yet.")).toBeTruthy();
  });

  it("says the project wasn't found for an unknown key, and for one the User isn't a Member of", async () => {
    vi.spyOn(api, "project").mockRejectedValue(new ApiError(404, "Project not found"));
    showAt("/projects/NOPE");

    expect(await screen.findByText("Project not found.")).toBeTruthy();
  });

  it("opens a project the list already holds at once, then refreshes it", async () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.projects, [apple]);
    // The refresh never answers: what shows now comes from the list.
    const project = vi.spyOn(api, "project").mockReturnValue(new Promise(() => {}));
    showAt("/projects/app", client);

    expect(screen.getByText("Fruit stand")).toBeTruthy();
    expect(document.querySelector("[aria-busy='true']")).toBeNull();
    expect(project).toHaveBeenCalledWith("app");
  });

  it("doesn't take an address the server wouldn't match for a listed project", async () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.projects, [apple]);
    vi.spyOn(api, "project").mockReturnValue(new Promise(() => {}));
    showAt("/projects/%C5%BFap", client);

    // "ſap" is not "SAP", let alone "APP": nothing shows until the server answers.
    expect(screen.queryByText("Fruit stand")).toBeNull();
  });
});
