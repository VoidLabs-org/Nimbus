// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type MemberRole, type Project, type ProjectMember } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { SessionContext, type Session } from "../auth/useSession";
import MembersPage from "./MembersPage";

const project: Project = {
  id: "p1",
  key: "NIM",
  name: "Nimbus",
  description: null,
  archived: false,
  createdAt: "2026-10-19T00:00:00Z",
  createdBy: { id: "u1", displayName: "Dana", avatarUrl: null },
  memberCount: 2,
  members: [],
};
const member = (id: string, displayName: string, role: string): ProjectMember => ({
  id,
  email: `${displayName.toLowerCase()}@example.com`,
  displayName,
  avatarUrl: null,
  role,
  addedAt: "2026-10-19T00:00:00Z",
});
const members = [member("u1", "Dana", "project_admin"), member("u2", "Bob", "developer")];
const roles: MemberRole[] = [
  { key: "developer", name: "Developer", assignable: true },
  { key: "project_admin", name: "Project admin", assignable: true },
  { key: "viewer", name: "Viewer", assignable: true },
];
const session = {
  user: { id: "u1", displayName: "Dana", email: "dana@example.com" },
} as unknown as Session;

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
  vi.spyOn(api, "projectMembers").mockResolvedValue(members);
  vi.spyOn(api, "memberRoles").mockResolvedValue(roles);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreMatchMedia();
});

function show(held: Record<string, "own" | "project" | "all">) {
  vi.spyOn(api, "myProjectPermissions").mockResolvedValue(held);
  return render(
    <NimbusThemeProvider>
      <QueryClientProvider client={createQueryClient()}>
        <SessionContext value={session}>
          <MemoryRouter initialEntries={["/projects/NIM/members"]}>
            <Routes>
              <Route path="/projects/:key/members" element={<MembersPage />} />
            </Routes>
          </MemoryRouter>
        </SessionContext>
      </QueryClientProvider>
    </NimbusThemeProvider>,
  );
}

describe("MembersPage", () => {
  it("lets a Member manager add by email and remove others, but not themselves", async () => {
    show({ "projects:member:manage": "project" });
    const add = vi.spyOn(api, "addMember").mockResolvedValue(member("u3", "Eve", "developer"));
    const remove = vi.spyOn(api, "removeMember").mockResolvedValue(undefined);

    expect(await screen.findByText("Bob")).toBeTruthy();
    // Only Bob's row has a Remove button: nobody changes their own membership.
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "eve@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Member" }));
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith("NIM", { email: "eve@example.com", role: "developer" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("NIM", "u2"));
  });

  it("shows only the list to a Member without projects:member:manage", async () => {
    show({});
    expect(await screen.findByText("Bob")).toBeTruthy();
    await waitFor(() => expect(api.myProjectPermissions).toHaveBeenCalled());
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    expect(screen.getByText("Developer")).toBeTruthy();
    expect(api.memberRoles).not.toHaveBeenCalled();
  });

  it("freezes an Archived project's Members even for a manager", async () => {
    vi.spyOn(api, "project").mockResolvedValue({ ...project, archived: true });
    show({ "projects:member:manage": "project" });
    expect(await screen.findByText("Bob")).toBeTruthy();
    expect(screen.getByText(/can't be changed/)).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });
});
