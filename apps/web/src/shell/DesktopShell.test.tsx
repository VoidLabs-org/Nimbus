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
import { PEEK_DELAY_MS } from "./DesktopShell";
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

let showAppMenu: ReturnType<typeof vi.fn<NimbusDesktop["showAppMenu"]>>;

/** Runs as the Desktop app on `platform`, as the preload script would make it. */
function asDesktop(platform: NimbusDesktop["platform"] = "win32") {
  showAppMenu = vi.fn<NimbusDesktop["showAppMenu"]>();
  window.nimbusDesktop = { platform, setTheme: vi.fn(), showAppMenu };
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

/** The Sidebar button, once the shell's chunk has loaded. */
async function sidebarButton(name: "Open the Sidebar" | "Fold the Sidebar"): Promise<HTMLElement> {
  return screen.findByRole("button", { name });
}

/** The names of the Sidebar's page links, in order. */
function linkNames(nav: HTMLElement): string[] {
  return within(nav)
    .getAllByRole("link")
    .map((link) => link.textContent ?? "");
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

  it("highlights the open page", async () => {
    asDesktop();
    renderAt("/");

    const nav = await sidebar();
    const current = within(nav)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page")
      .map((link) => link.textContent);
    expect(current).toEqual(["Home"]);
  });

  it("has no brand row, as other desktop apps don't", async () => {
    asDesktop();
    renderAt("/");

    const nav = await sidebar();
    expect(within(nav).queryByText("nimbus")).toBeNull();
  });

  it("has the Nimbus icon at the top left on Windows, popping the app menu up under it", async () => {
    asDesktop("win32");
    renderAt("/");

    await sidebar();
    fireEvent.click(screen.getByRole("button", { name: "Nimbus menu" }));
    expect(showAppMenu).toHaveBeenCalledOnce();
  });

  it("has no Nimbus icon on macOS, which has the menu bar", async () => {
    asDesktop("darwin");
    renderAt("/");

    await sidebar();
    expect(screen.queryByRole("button", { name: "Nimbus menu" })).toBeNull();
  });

  it("has Settings and the account at its bottom, the account opening its menu with Sign out", async () => {
    asDesktop();
    renderAt("/");

    const nav = await sidebar();
    const settings = within(nav).getByRole("link", { name: "Settings" });
    const account = within(nav).getByRole("button", { name: "Account menu for Alice Example" });
    // Settings, then the account, after the other links.
    expect(
      within(nav).getByRole("link", { name: "Projects" }).compareDocumentPosition(settings) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      settings.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(account.textContent).toContain("Alice Example");
    expect(account.textContent).toContain("alice@example.com");
    fireEvent.click(account);
    expect(await screen.findByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  });

  it("is open by default, and folds away completely with the Sidebar button, remembering it", async () => {
    asDesktop();
    renderAt("/");

    await sidebar();
    fireEvent.click(screen.getByRole("button", { name: "Fold the Sidebar" }));

    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("folded");

    fireEvent.click(screen.getByRole("button", { name: "Open the Sidebar" }));
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("open");
  });

  it("folds and opens with Ctrl \\ on Windows", async () => {
    asDesktop("win32");
    renderAt("/");

    await sidebar();
    fireEvent.keyDown(window, { key: "\\", code: "Backslash", ctrlKey: true });
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    fireEvent.keyDown(window, { key: "\\", code: "Backslash", ctrlKey: true });
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });

  it("folds with ⌘ \\ on macOS, not Ctrl \\", async () => {
    asDesktop("darwin");
    renderAt("/");

    await sidebar();
    fireEvent.keyDown(window, { key: "\\", code: "Backslash", ctrlKey: true });
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "\\", code: "Backslash", metaKey: true });
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("starts folded when that was chosen on this computer", async () => {
    localStorage.setItem(SIDEBAR_KEY, "folded");
    asDesktop();
    renderAt("/");

    await sidebarButton("Open the Sidebar");
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("folds itself under 960px wide without changing the choice, and opens on request", async () => {
    stubWindowWidth(true);
    asDesktop();
    renderAt("/");

    fireEvent.click(await sidebarButton("Open the Sidebar"));
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(localStorage.getItem(SIDEBAR_KEY)).toBeNull();
  });
});

describe("peeking at the folded Sidebar", () => {
  /** Folded, with the pointer resting on the Sidebar button until the Sidebar peeks out. */
  async function peek(): Promise<HTMLElement> {
    localStorage.setItem(SIDEBAR_KEY, "folded");
    asDesktop();
    renderAt("/");
    fireEvent.mouseEnter(await sidebarButton("Open the Sidebar"));
    return sidebar();
  }

  /** Somewhere on the page, beside the Sidebar. */
  const page = () => screen.getByText("Welcome", { exact: false });

  it("peeks out over the page while the pointer rests on the button, without opening for good", async () => {
    const nav = await peek();

    expect(nav.dataset.peek).toBeDefined();
    expect(screen.getByRole("button", { name: "Open the Sidebar" })).toBeTruthy();
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("folded");
  });

  it("goes when the pointer moves onto the page", async () => {
    const nav = await peek();
    fireEvent.mouseLeave(nav, { relatedTarget: page() });

    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("stays while the pointer moves from the Sidebar back onto the button", async () => {
    const nav = await peek();
    fireEvent.mouseLeave(nav, {
      relatedTarget: screen.getByRole("button", { name: "Open the Sidebar" }),
    });

    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });

  it("goes on Esc, and when a page is opened from it", async () => {
    await peek();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();

    fireEvent.mouseEnter(screen.getByRole("button", { name: "Open the Sidebar" }));
    const nav = await sidebar();
    fireEvent.click(within(nav).getByRole("link", { name: "Settings" }));
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("doesn't peek when the pointer only passes over the button", async () => {
    localStorage.setItem(SIDEBAR_KEY, "folded");
    asDesktop();
    renderAt("/");
    const button = await sidebarButton("Open the Sidebar");
    fireEvent.mouseEnter(button);
    fireEvent.mouseLeave(button, { relatedTarget: page() });

    await new Promise((resolve) => setTimeout(resolve, PEEK_DELAY_MS + 100));
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("stays folded when folded again after opening from a peek", async () => {
    await peek();
    fireEvent.click(screen.getByRole("button", { name: "Open the Sidebar" }));
    fireEvent.click(screen.getByRole("button", { name: "Fold the Sidebar" }));

    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("opens for good when the button is clicked while peeking", async () => {
    await peek();
    fireEvent.click(screen.getByRole("button", { name: "Open the Sidebar" }));

    expect(screen.getByRole("navigation", { name: "Main" }).dataset.peek).toBeUndefined();
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("open");
  });
});

describe("the Appearance page in the Desktop app", () => {
  it("has only the theme, kept on this computer: no navbar position, and the Sidebar folds with its button", async () => {
    asDesktop();
    renderAt("/settings/appearance");

    expect(await screen.findByRole("heading", { name: "Appearance" })).toBeTruthy();
    expect(screen.queryByText("Navbar position")).toBeNull();
    expect(screen.queryByText("Sidebar")).toBeNull();
    expect(screen.getByText("kept on this computer", { exact: false })).toBeTruthy();
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
