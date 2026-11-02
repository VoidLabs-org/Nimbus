// @vitest-environment jsdom
import { ApiError } from "@repo/api";
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type Issue } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import IssuePage from "./IssuePage";

const issue: Issue = {
  id: "i1",
  key: "NIM-12",
  number: 12,
  type: "Bug",
  title: "Crash on save",
  description:
    "- [ ] reproduce\n\n<script>window.hacked = true</script>\n\n[bad](javascript:alert(1))",
  priority: "High",
  status: { id: "s1", name: "To do", category: "TODO" },
  reporter: { id: "u1", displayName: "Dana", avatarUrl: null },
  assignee: null,
  createdAt: "2026-11-02T00:00:00Z",
  updatedAt: "2026-11-02T00:00:00Z",
  version: 0,
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

function showAt(path: string) {
  return render(
    <NimbusThemeProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/issues/:issueKey" element={<IssuePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </NimbusThemeProvider>,
  );
}

describe("an Issue's page", () => {
  it("shows its key, type, title, Status, priority, Reporter and no Assignee", async () => {
    vi.spyOn(api, "issue").mockResolvedValue(issue);
    showAt("/issues/nim-12");

    expect(await screen.findByRole("heading", { name: "Crash on save" })).toBeTruthy();
    expect(screen.getAllByText("NIM-12").length).toBeGreaterThan(0);
    expect(screen.getByText("Bug")).toBeTruthy();
    expect(screen.getByText("(To do)")).toBeTruthy();
    expect(screen.getByText("High")).toBeTruthy();
    expect(screen.getByText("Dana")).toBeTruthy();
    expect(screen.getByText("Unassigned")).toBeTruthy();
  });

  it("renders the description as Markdown without running scripts or unsafe links", async () => {
    vi.spyOn(api, "issue").mockResolvedValue(issue);
    const { container } = showAt("/issues/NIM-12");

    await screen.findByRole("heading", { name: "Crash on save" });
    expect(screen.getByRole("checkbox")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/window\.hacked/)).toBeTruthy();
    const link = screen.getByText("bad").closest("a");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });

  it("says the Issue is not found for an unknown key", async () => {
    vi.spyOn(api, "issue").mockRejectedValue(new ApiError(404, "Issue not found"));
    showAt("/issues/NIM-99");

    expect(await screen.findByText("Issue not found.")).toBeTruthy();
  });
});
