// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type User } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { SessionContext, type Session } from "../auth/useSession";
import { AppRoutes } from "../App";
import type { NimbusDesktop } from "./desktop";
import { AUTO_FOLD_QUERY, resetSidebarState, SIDEBAR_KEY } from "./sidebarState";

const alice: User = {
  id: "u1",
  email: "alice@example.com",
  displayName: "Alice Example",
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

/**
 * Stands in for matchMedia: nothing matches (light system, no reduced motion), except the auto-fold query when the
 * window is `narrow`.
 */
function stubWindowWidth(narrow: boolean) {
  window.matchMedia = (query: string) =>
    ({
      matches: narrow && query === AUTO_FOLD_QUERY,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

/** Runs as the Desktop app on `platform`, as the preload script would make it. */
function asDesktop(platform: NimbusDesktop["platform"] = "win32") {
  window.nimbusDesktop = { platform, setTheme: vi.fn() };
}

// Mantine's pill tabs (Appearance) measure themselves; jsdom has no ResizeObserver.
class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const realMatchMedia = window.matchMedia;
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResizeObserver);
  localStorage.clear();
  resetSidebarState();
  stubWindowWidth(false);
  vi.spyOn(api, "myPlatformPermissions").mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete window.nimbusDesktop;
  window.matchMedia = realMatchMedia;
});

function renderAt(path: string) {
  return render(
    <NimbusThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={createQueryClient()}>
          <SessionContext value={session}>
            <AppRoutes />
          </SessionContext>
        </QueryClientProvider>
      </MemoryRouter>
    </NimbusThemeProvider>,
  );
}

/** The Sidebar, once its chunk has loaded. */
async function sidebar(): Promise<HTMLElement> {
  return screen.findByRole("navigation", { name: "Main" });
}

/** The names of the Sidebar's page links, in order (the rail names its icons with aria-label). */
function linkNames(nav: HTMLElement): string[] {
  return within(nav)
    .getAllByRole("link")
    .map((link) => link.getAttribute("aria-label") ?? link.textContent ?? "")
    .filter((name) => name !== "nimbus" && name !== "Nimbus home");
}

describe("the Desktop app's Sidebar", () => {
  it("lists Home, Projects and Settings, not each Settings page", async () => {
    vi.spyOn(api, "myPlatformPermissions").mockResolvedValue([
      "access:role:manage",
      "access:audit:view",
    ]);
    asDesktop();
    renderAt("/");

    const nav = await sidebar();
    expect(linkNames(nav)).toEqual(["Home", "Projects", "Settings"]);
  });

  it("highlights the open page, Settings on every page under it", async () => {
    asDesktop();
    renderAt("/settings/security");

    const nav = await sidebar();
    const current = within(nav)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page")
      .map((link) => link.textContent);
    expect(current).toEqual(["Settings"]);
  });

  it("has the account at its top, opening the account menu with Sign out", async () => {
    asDesktop();
    renderAt("/");

    const nav = await sidebar();
    const account = within(nav).getByRole("button", { name: "Account menu for Alice Example" });
    expect(account.textContent).toContain("Alice Example");
    expect(account.textContent).toContain("alice@example.com");
    fireEvent.click(account);
    expect(await screen.findByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  });

  it("is open by default, and folds into a rail of icons with the fold button, remembering it", async () => {
    asDesktop();
    renderAt("/");

    const nav = await sidebar();
    expect(within(nav).getByText("Projects")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fold the Sidebar" }));

    // Folded, the names are only tooltips and labels.
    expect(within(nav).queryByText("Projects")).toBeNull();
    expect(linkNames(nav)).toEqual(["Home", "Projects", "Settings"]);
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("folded");

    fireEvent.click(screen.getByRole("button", { name: "Open the Sidebar" }));
    expect(within(nav).getByText("Projects")).toBeTruthy();
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("open");
  });

  it("folds and opens with Ctrl \\ on Windows", async () => {
    asDesktop("win32");
    renderAt("/");

    await sidebar();
    fireEvent.keyDown(window, { key: "\\", code: "Backslash", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Open the Sidebar" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "\\", code: "Backslash", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Fold the Sidebar" })).toBeTruthy();
  });

  it("folds with ⌘ \\ on macOS, not Ctrl \\", async () => {
    asDesktop("darwin");
    renderAt("/");

    await sidebar();
    fireEvent.keyDown(window, { key: "\\", code: "Backslash", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Fold the Sidebar" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "\\", code: "Backslash", metaKey: true });
    expect(screen.getByRole("button", { name: "Open the Sidebar" })).toBeTruthy();
  });

  it("starts folded when that was chosen on this computer", async () => {
    localStorage.setItem(SIDEBAR_KEY, "folded");
    asDesktop();
    renderAt("/");

    await sidebar();
    expect(screen.getByRole("button", { name: "Open the Sidebar" })).toBeTruthy();
  });

  it("folds itself under 960px wide without changing the choice, and opens on request", async () => {
    stubWindowWidth(true);
    asDesktop();
    renderAt("/");

    const nav = await sidebar();
    expect(screen.getByRole("button", { name: "Open the Sidebar" })).toBeTruthy();
    expect(localStorage.getItem(SIDEBAR_KEY)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open the Sidebar" }));
    expect(within(nav).getByText("Projects")).toBeTruthy();
    expect(localStorage.getItem(SIDEBAR_KEY)).toBeNull();
  });

  it("offers Open or Folded on the Appearance page instead of the navbar position", async () => {
    asDesktop();
    renderAt("/settings/appearance");

    await sidebar();
    expect(screen.queryByText("Navbar position")).toBeNull();
    // The theme's note and the Sidebar's both say so.
    expect(screen.getAllByText("kept on this computer", { exact: false })).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Folded"));

    expect(screen.getByRole("button", { name: "Open the Sidebar" })).toBeTruthy();
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("folded");
  });
});

describe("in a browser", () => {
  it("keeps the navbar and its position picker, with no Sidebar", () => {
    renderAt("/settings/appearance");

    expect(screen.queryByRole("button", { name: "Fold the Sidebar" })).toBeNull();
    expect(document.querySelector('[data-nav-focus="home"]')).not.toBeNull();
    expect(screen.getAllByText("Navbar position").length).toBeGreaterThan(0);
  });
});
