// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type User } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { SessionContext, type Session } from "../auth/useSession";
import { AppRoutes } from "../App";

// The Settings overlay's chunk can't be loaded, as after a redeploy removed it.
vi.mock("./SettingsOverlay", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

const alice: User = {
  id: "u1",
  email: "alice@example.com",
  displayName: "Alice",
  avatarUrl: null,
  hasPassword: true,
  emailVerified: true,
  passwordChangedAt: null,
  hasUploadedPicture: false,
  pictureSource: "initials",
  pictureOptions: { uploadedAt: null, uploadedUrl: null, providers: [] },
};

const unused = () => Promise.resolve();

const session: Session = {
  user: alice,
  restoring: false,
  unavailable: null,
  signedOutOnPurpose: false,
  returnAfterSignOut: null,
  retry: () => {},
  register: unused,
  login: () => Promise.resolve("signed-in"),
  signInWithCode: unused,
  updateDisplayName: unused,
  changeEmail: unused,
  uploadProfilePicture: unused,
  removeProfilePicture: unused,
  choosePictureSource: unused,
  changePassword: unused,
  verifyEmail: unused,
  confirmingEmail: false,
  finishVerifying: () => {},
  logout: unused,
};

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
  vi.spyOn(api, "myPlatformPermissions").mockResolvedValue([]);
  // The failure is logged; keep the test output quiet.
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.nimbusDesktop = { platform: "win32", setTheme: vi.fn(), showAppMenu: vi.fn() };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window.nimbusDesktop;
  restoreMatchMedia();
});

describe("the Desktop app, when its Settings overlay can't load", () => {
  it("shows Settings as pages in the shell instead, so Settings stays reachable", async () => {
    render(
      <NimbusThemeProvider>
        <MemoryRouter initialEntries={["/settings/profile"]}>
          <QueryClientProvider client={createQueryClient()}>
            <SessionContext value={session}>
              <AppRoutes />
            </SessionContext>
          </QueryClientProvider>
        </MemoryRouter>
      </NimbusThemeProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Profile" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  });

  it("closes Jump when it opens Settings as a page, which never waits for an overlay", async () => {
    render(
      <NimbusThemeProvider>
        <MemoryRouter initialEntries={["/"]}>
          <QueryClientProvider client={createQueryClient()}>
            <SessionContext value={session}>
              <AppRoutes />
            </SessionContext>
          </QueryClientProvider>
        </MemoryRouter>
      </NimbusThemeProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Search or jump to/ }));
    const jump = await screen.findByRole("dialog", { name: "Jump" });

    fireEvent.keyDown(within(jump).getByRole("combobox"), {
      key: ",",
      code: "Comma",
      ctrlKey: true,
    });

    // The overview: the overlay's redirect to Profile is not there.
    expect(await screen.findByRole("heading", { name: "Account" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Jump" })).toBeNull());
  });

  it("closes Jump over Settings shown as a page: it never turns into the overlay Jump would wait for", async () => {
    render(
      <NimbusThemeProvider>
        <MemoryRouter initialEntries={["/settings/profile"]}>
          <QueryClientProvider client={createQueryClient()}>
            <SessionContext value={session}>
              <AppRoutes />
            </SessionContext>
          </QueryClientProvider>
        </MemoryRouter>
      </NimbusThemeProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Search or jump to/ }));
    const jump = await screen.findByRole("dialog", { name: "Jump" });

    fireEvent.keyDown(within(jump).getByRole("combobox"), {
      key: ",",
      code: "Comma",
      ctrlKey: true,
    });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Jump" })).toBeNull());
    // Settings is open already: the page stays.
    expect(await screen.findByRole("heading", { name: "Profile" })).toBeTruthy();
  });

  it("leaves Settings, shown as a page, out of the Tabs", async () => {
    localStorage.setItem(
      `nimbus-tabs:${alice.id}`,
      JSON.stringify({
        tabs: [{ id: "t0", path: "/projects", title: "Projects" }],
        selected: "t0",
      }),
    );
    render(
      <NimbusThemeProvider>
        <MemoryRouter initialEntries={["/settings/profile"]}>
          <QueryClientProvider client={createQueryClient()}>
            <SessionContext value={session}>
              <AppRoutes />
            </SessionContext>
          </QueryClientProvider>
        </MemoryRouter>
      </NimbusThemeProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Profile" })).toBeTruthy();
    const tabs = within(screen.getByRole("tablist", { name: "Tabs" })).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Projects"]);
    localStorage.clear();
  });
});
