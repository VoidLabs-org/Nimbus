// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type User } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { SessionContext, type Session } from "../auth/useSession";
import { AppRoutes } from "../App";
import type { NimbusDesktop } from "./desktop";
import { resetSidebarState } from "./sidebarState";

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

/** A request that is still on its way, so a page shows its loading state. */
const pending = () => new Promise<never>(() => {});

// Mantine's pill tabs (Appearance) measure themselves; jsdom has no ResizeObserver.
class NoResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Runs as the Desktop app on `platform`, as the preload script would make it. */
function asDesktop(platform: NimbusDesktop["platform"] = "win32") {
  window.nimbusDesktop = { platform, setTheme: vi.fn(), showAppMenu: vi.fn() };
}

const realMatchMedia = window.matchMedia;
beforeEach(() => {
  localStorage.clear();
  resetSidebarState();
  vi.stubGlobal("ResizeObserver", NoResizeObserver);
  // Nothing matches: a light system, a wide window, no reduced motion.
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
  vi.spyOn(api, "myPlatformPermissions").mockResolvedValue([]);
  // What Security asks for on every visit.
  vi.spyOn(api, "sessions").mockImplementation(pending);
  vi.spyOn(api, "providers").mockResolvedValue([]);
  vi.spyOn(api, "linkedIdentities").mockResolvedValue([]);
  vi.spyOn(api, "twoStep").mockImplementation(pending);
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

/** The Settings overlay, once it is open. */
function overlay(): Promise<HTMLElement> {
  return screen.findByRole("dialog", { name: "Settings" });
}

/** Esc, pressed where the keyboard focus is, as a real key press is. */
function pressEscape() {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
}

/** Home, the page behind the overlay in these tests. */
const HOME = "Welcome, Alice Example";

describe("the Settings overlay in the Desktop app", () => {
  it("opens over the page from Settings in the Sidebar, on Profile, with Settings highlighted", async () => {
    asDesktop();
    renderAt("/");

    const sidebar = await screen.findByRole("navigation", { name: "Main" });
    fireEvent.click(within(sidebar).getByRole("link", { name: "Settings" }));

    const settings = await overlay();
    expect(await within(settings).findByRole("heading", { name: "Profile" })).toBeTruthy();
    expect(screen.getByText(HOME, { exact: false })).toBeTruthy();
    expect(within(sidebar).getByRole("link", { name: "Settings" }).dataset.active).toBeDefined();
  });

  it("opens with Ctrl , on Windows and ⌘ , on macOS", async () => {
    asDesktop("win32");
    renderAt("/");
    await screen.findByRole("navigation", { name: "Main" });
    fireEvent.keyDown(window, { key: ",", code: "Comma", ctrlKey: true });
    expect(await overlay()).toBeTruthy();
    cleanup();

    asDesktop("darwin");
    renderAt("/");
    await screen.findByRole("navigation", { name: "Main" });
    fireEvent.keyDown(window, { key: ",", code: "Comma", metaKey: true });
    expect(await overlay()).toBeTruthy();
  });

  it("lists the Account pages, and the Workspace ones only for a User who may open them", async () => {
    asDesktop();
    renderAt("/settings/profile");
    const settings = await overlay();
    const pages = () =>
      within(within(settings).getByRole("navigation", { name: "Settings pages" }))
        .getAllByRole("link")
        .map((link) => link.textContent);
    expect(pages()).toEqual(["Profile", "Security", "Appearance"]);
    cleanup();

    vi.spyOn(api, "myPlatformPermissions").mockResolvedValue([
      "access:role:manage",
      "access:audit:view",
    ]);
    renderAt("/settings/profile");
    const withWorkspace = await overlay();
    await within(withWorkspace).findByRole("link", { name: "Audit log" });
    expect(
      within(within(withWorkspace).getByRole("navigation", { name: "Settings pages" }))
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Profile", "Security", "Appearance", "Roles & access", "Audit log"]);
  });

  it("moves between pages inside, keeping the page behind", async () => {
    asDesktop();
    renderAt("/");
    fireEvent.click(
      within(await screen.findByRole("navigation", { name: "Main" })).getByRole("link", {
        name: /Settings/,
      }),
    );
    const settings = await overlay();
    fireEvent.click(within(settings).getByRole("link", { name: "Appearance" }));

    expect(await within(settings).findByRole("heading", { name: "Appearance" })).toBeTruthy();
    expect(
      within(settings).getByRole("link", { name: "Appearance" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.getByText(HOME, { exact: false })).toBeTruthy();
  });

  it("closes with Esc, leaving the User on the page they were on", async () => {
    asDesktop();
    renderAt("/settings/profile");
    await overlay();
    pressEscape();

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull());
    expect(screen.getByText(HOME, { exact: false })).toBeTruthy();
  });

  it("closes a dialog open over it first on Esc, not the overlay", async () => {
    asDesktop();
    renderAt("/settings/profile");
    const settings = await overlay();
    fireEvent.click(within(settings).getByRole("button", { name: "Edit" }));
    await screen.findByRole("dialog", { name: "Edit display name" });

    pressEscape();
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
  });

  it("closes with a click on the dimmed app around it", async () => {
    asDesktop();
    renderAt("/settings/profile");
    await overlay();
    fireEvent.click(document.querySelector("[data-settings-backdrop]")!);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull());
    expect(screen.getByText(HOME, { exact: false })).toBeTruthy();
  });

  it("closes with its ✕", async () => {
    asDesktop();
    renderAt("/settings/profile");
    fireEvent.click(within(await overlay()).getByRole("button", { name: "Close Settings" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull());
  });

  it("opens over Home from a Settings address, as a link or a restored page would", async () => {
    asDesktop();
    renderAt("/settings/security");

    const settings = await overlay();
    expect(within(settings).getByRole("heading", { name: "Security" })).toBeTruthy();
    expect(screen.getByText(HOME, { exact: false })).toBeTruthy();
  });

  it("opens Profile for Settings itself", async () => {
    asDesktop();
    renderAt("/settings");

    expect(within(await overlay()).getByRole("heading", { name: "Profile" })).toBeTruthy();
  });

  it("shows a Role inside, its path starting at Roles & access", async () => {
    vi.spyOn(api, "myPlatformPermissions").mockResolvedValue(["access:role:manage"]);
    vi.spyOn(api, "role").mockImplementation(pending);
    vi.spyOn(api, "permissionCatalog").mockImplementation(pending);
    vi.spyOn(api, "roleHolders").mockImplementation(pending);
    asDesktop();
    renderAt("/settings/roles/ADMIN");

    const settings = await overlay();
    const path = within(settings).getByRole("navigation", { name: "Breadcrumb" });
    expect(within(path).getByRole("link", { name: "Roles & access" })).toBeTruthy();
    expect(within(path).queryByRole("link", { name: "Settings" })).toBeNull();
    const list = within(settings).getByRole("navigation", { name: "Settings pages" });
    expect(
      (await within(list).findByRole("link", { name: "Roles & access" })).getAttribute(
        "aria-current",
      ),
    ).toBe("page");
  });

  it("shows no Settings path above a page the list opens", async () => {
    asDesktop();
    renderAt("/settings/profile");

    const settings = await overlay();
    expect(within(settings).queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });
});

describe("Settings in a browser", () => {
  it("stays a page in the navbar shell, with its breadcrumbs", async () => {
    renderAt("/settings/profile");

    expect(await screen.findByRole("heading", { name: "Profile" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeTruthy();
  });
});
