// @vitest-environment jsdom
import { ApiError } from "@repo/api";
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type Project } from "../api/client";
import { queryKeys } from "../api/queries";
import { createQueryClient } from "../api/queryClient";
import { SessionContext, type Session } from "../auth/useSession";
import { ProjectLayout } from "../projects/ProjectLayout";
import ProjectPage, { ProjectHome } from "./ProjectPage";

const apple: Project = {
  id: "p1",
  key: "APP",
  name: "apple",
  description: "Fruit stand",
  archived: false,
  createdAt: "2026-10-19T00:00:00Z",
};

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
        <SessionContext value={session}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/projects/:key" element={<ProjectLayout />}>
                <Route index element={<ProjectHome />} />
                <Route path="overview" element={<ProjectPage />} />
                <Route path="issues" element={<Where />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </SessionContext>
      </QueryClientProvider>
    </NimbusThemeProvider>,
  );
}

/** Stands in for the Issues page: says where the router ended up. */
function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

describe("a project's address", () => {
  it("opens the project's Issues", async () => {
    showAt("/projects/APP");

    expect((await screen.findByTestId("where")).textContent).toBe("/projects/APP/issues");
  });

  it("keeps the query string, so a link to a view still opens it", async () => {
    showAt("/projects/APP?view=board");

    expect((await screen.findByTestId("where")).textContent).toBe(
      "/projects/APP/issues?view=board",
    );
  });
});

describe("a project's Overview", () => {
  it("shows its name, key and description", async () => {
    vi.spyOn(api, "project").mockResolvedValue(apple);
    showAt("/projects/app/overview");

    expect(await screen.findByRole("heading", { name: "apple" })).toBeTruthy();
    // In the badge and after "Key".
    expect(screen.getAllByText("APP")).toHaveLength(2);
    expect(screen.getByText("Fruit stand")).toBeTruthy();
  });

  it("shows the project's tabs, Overview open, with Settings for a User who may manage Statuses", async () => {
    vi.spyOn(api, "project").mockResolvedValue(apple);
    showAt("/projects/app/overview");

    // The tabs show at once; their links use the project's own key once it has loaded.
    await screen.findByRole("heading", { name: "apple" });
    const tabs = screen.getByRole("navigation", { name: "Project" });
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("link", { name: "Issues" }).getAttribute("href")).toBe(
      "/projects/APP/issues",
    );
    expect((await screen.findByRole("link", { name: "Settings" })).getAttribute("href")).toBe(
      "/projects/APP/settings/statuses",
    );
    expect(tabs.children).toHaveLength(3);
  });

  it("leaves Settings out for a User who may not manage Statuses", async () => {
    vi.spyOn(api, "myProjectPermissions").mockResolvedValue({});
    vi.spyOn(api, "project").mockResolvedValue(apple);
    showAt("/projects/app/overview");

    await screen.findByRole("link", { name: "Issues" });
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  });

  it("says there is no description when it has none", async () => {
    vi.spyOn(api, "project").mockResolvedValue({ ...apple, description: null });
    showAt("/projects/APP/overview");

    expect(await screen.findByText("No description yet.")).toBeTruthy();
  });

  it("says the project wasn't found for an unknown key, and for one the User isn't a Member of", async () => {
    vi.spyOn(api, "project").mockRejectedValue(new ApiError(404, "Project not found"));
    showAt("/projects/NOPE/overview");

    expect(await screen.findByText("Project not found.")).toBeTruthy();
  });

  it("opens a project the list already holds at once, then refreshes it", async () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.projects, [apple]);
    // The refresh never answers: what shows now comes from the list.
    const project = vi.spyOn(api, "project").mockReturnValue(new Promise(() => {}));
    showAt("/projects/app/overview", client);

    expect(screen.getByText("Fruit stand")).toBeTruthy();
    expect(document.querySelector("[aria-busy='true']")).toBeNull();
    expect(project).toHaveBeenCalledWith("app");
  });

  it("doesn't take an address the server wouldn't match for a listed project", async () => {
    const client = createQueryClient();
    client.setQueryData(queryKeys.projects, [apple]);
    vi.spyOn(api, "project").mockReturnValue(new Promise(() => {}));
    showAt("/projects/%C5%BFap/overview", client);

    // "ſap" is not "SAP", let alone "APP": nothing shows until the server answers.
    expect(screen.queryByText("Fruit stand")).toBeNull();
  });
});
