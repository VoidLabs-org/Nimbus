// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, type Project, type User } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { SessionContext, type Session } from "../auth/useSession";
import { AppRoutes } from "../App";
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

const bob: User = { ...alice, id: "u2", email: "bob@example.com", displayName: "Bob Example" };

const unused = () => Promise.resolve();

function sessionFor(user: User | null): Session {
  return {
    user,
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
}

const PROJECTS: Record<string, Project> = {
  APO: project("APO", "Apollo"),
  GEM: project("GEM", "Gemini launch plan with a very long name that will not fit in a Tab"),
};

function project(key: string, name: string): Project {
  return {
    id: key,
    key,
    name,
    description: null,
    archived: false,
    createdAt: "2026-10-01T09:00:00Z",
  };
}

/** Runs as the Desktop app on `platform`, as the preload script would make it. */
function asDesktop(platform: "darwin" | "win32" | "linux" = "win32") {
  window.nimbusDesktop = { platform, setTheme: vi.fn(), showAppMenu: vi.fn() };
}

const realMatchMedia = window.matchMedia;
beforeEach(() => {
  localStorage.clear();
  resetSidebarState();
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
  vi.spyOn(api, "project").mockImplementation((key) =>
    PROJECTS[key]
      ? Promise.resolve(PROJECTS[key])
      : Promise.reject(new ApiError(404, "Project not found")),
  );
  asDesktop();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window.nimbusDesktop;
  window.matchMedia = realMatchMedia;
});

/** The address the app is on, shown so a test can read it. */
function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.pathname + location.search}</output>;
}

function renderAt(path: string, user: User | null = alice) {
  return render(
    <NimbusThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={createQueryClient()}>
          <SessionContext value={sessionFor(user)}>
            <AppRoutes />
            <Address />
          </SessionContext>
        </QueryClientProvider>
      </MemoryRouter>
    </NimbusThemeProvider>,
  );
}

/** Stores Tabs for a User, as an earlier run of the app would have left them. */
function storeTabs(userId: string, tabs: [path: string, title: string][], selected: string | null) {
  localStorage.setItem(
    `nimbus-tabs:${userId}`,
    JSON.stringify({ tabs: tabs.map(([path, title]) => ({ path, title })), selected }),
  );
}

function storedTabs(userId: string): unknown {
  const raw = localStorage.getItem(`nimbus-tabs:${userId}`);
  return raw === null ? null : JSON.parse(raw);
}

function address(): string {
  return screen.getByTestId("address").textContent ?? "";
}

/** The Tab row, once the shell's chunk has loaded. */
async function tabRow(): Promise<HTMLElement> {
  return screen.findByRole("navigation", { name: "Tabs" });
}

/** The Tabs' names, in order. */
function tabNames(row: HTMLElement): string[] {
  return within(row)
    .getAllByRole("link")
    .map((link) => link.textContent ?? "");
}

/** The selected Tab's name. */
function selectedTab(row: HTMLElement): string | null {
  return (
    within(row)
      .getAllByRole("link")
      .find((link) => link.getAttribute("aria-current") === "page")?.textContent ?? null
  );
}

describe("the Desktop app's Tabs", () => {
  it("opens a Tab for the page, named like its breadcrumb", async () => {
    renderAt("/projects/APO");

    const row = await tabRow();
    await within(row).findByRole("link", { name: "Apollo" });
    expect(tabNames(row)).toEqual(["Apollo"]);
    expect(selectedTab(row)).toBe("Apollo");
  });

  it("selects the page's own Tab when it has one, whatever its query string", async () => {
    storeTabs(
      alice.id,
      [
        ["/projects", "Projects"],
        ["/projects/APO", "Apollo"],
      ],
      "/projects",
    );
    renderAt("/projects/APO?view=board");

    const row = await tabRow();
    expect(tabNames(row)).toEqual(["Projects", "Apollo"]);
    expect(selectedTab(row)).toBe("Apollo");
  });

  it("adds a Tab for each page opened, at the end", async () => {
    renderAt("/projects/APO");

    const row = await tabRow();
    await within(row).findByRole("link", { name: "Apollo" });
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: "Home" }),
    );
    expect(tabNames(row)).toEqual(["Apollo", "Home"]);
    expect(selectedTab(row)).toBe("Home");
  });

  it("opens a Tab's page when the Tab is clicked, as a normal page change", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects/APO", "Apollo"],
      ],
      "/projects/APO",
    );
    renderAt("/projects/APO");

    const row = await tabRow();
    fireEvent.click(within(row).getByRole("link", { name: "Home" }));
    expect(address()).toBe("/");
    expect(await screen.findByRole("heading", { name: "Welcome, Alice Example" })).toBeTruthy();
    expect(selectedTab(row)).toBe("Home");
  });

  it("closes a Tab with its ✕, selecting the one after it", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects", "Projects"],
        ["/projects/APO", "Apollo"],
      ],
      "/projects",
    );
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.click(within(row).getByRole("button", { name: "Close Projects" }));
    expect(tabNames(row)).toEqual(["Home", "Apollo"]);
    expect(address()).toBe("/projects/APO");
    expect(selectedTab(row)).toBe("Apollo");
  });

  it("selects the one before when the last in the row closes", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects", "Projects"],
      ],
      "/projects",
    );
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.click(within(row).getByRole("button", { name: "Close Projects" }));
    expect(address()).toBe("/");
    expect(tabNames(row)).toEqual(["Home"]);
  });

  it("stays on the page when another Tab closes", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects", "Projects"],
      ],
      "/projects",
    );
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.click(within(row).getByRole("button", { name: "Close Home" }));
    expect(address()).toBe("/projects");
    expect(tabNames(row)).toEqual(["Projects"]);
  });

  it("opens Home when the only Tab closes", async () => {
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.click(within(row).getByRole("button", { name: "Close Projects" }));
    expect(address()).toBe("/");
    expect(tabNames(row)).toEqual(["Home"]);
  });

  it("closes a Tab with a middle click", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects", "Projects"],
      ],
      "/projects",
    );
    renderAt("/projects");

    const row = await tabRow();
    const home = within(row).getByRole("link", { name: "Home" });
    fireEvent(home, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
    expect(tabNames(row)).toEqual(["Projects"]);
    expect(address()).toBe("/projects");
  });

  it("closes the selected Tab with Ctrl W on Windows", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects", "Projects"],
      ],
      "/projects",
    );
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.keyDown(window, { key: "w", code: "KeyW", ctrlKey: true });
    expect(tabNames(row)).toEqual(["Home"]);
    expect(address()).toBe("/");
  });

  it("closes the selected Tab with ⌘ W on macOS, not Ctrl W", async () => {
    asDesktop("darwin");
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects", "Projects"],
      ],
      "/projects",
    );
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.keyDown(window, { key: "w", code: "KeyW", ctrlKey: true });
    expect(tabNames(row)).toEqual(["Home", "Projects"]);
    fireEvent.keyDown(window, { key: "w", code: "KeyW", metaKey: true });
    expect(tabNames(row)).toEqual(["Home"]);
  });

  it("cycles the Tabs with Ctrl Tab and Ctrl Shift Tab, round the ends", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects", "Projects"],
        ["/projects/APO", "Apollo"],
      ],
      "/projects/APO",
    );
    renderAt("/projects/APO");

    const row = await tabRow();
    fireEvent.keyDown(window, { key: "Tab", code: "Tab", ctrlKey: true });
    expect(address()).toBe("/");
    fireEvent.keyDown(window, { key: "Tab", code: "Tab", ctrlKey: true, shiftKey: true });
    expect(address()).toBe("/projects/APO");
    fireEvent.keyDown(window, { key: "Tab", code: "Tab", ctrlKey: true, shiftKey: true });
    expect(address()).toBe("/projects");
    expect(selectedTab(row)).toBe("Projects");
  });

  it("keeps the selected Tab in view, and gives a long name in full on hover", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    try {
      renderAt("/projects/GEM");

      const row = await tabRow();
      const tab = await within(row).findByRole("link", { name: PROJECTS.GEM!.name });
      expect(tab.getAttribute("title")).toBe(PROJECTS.GEM!.name);
      expect(scrolled.mock.contexts.some((element) => (element as Element).contains(tab))).toBe(
        true,
      );
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it("never makes Settings a Tab: it opens over the selected Tab's page", async () => {
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.click(screen.getByRole("link", { name: "Settings" }));
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(tabNames(row)).toEqual(["Projects"]);
    expect(selectedTab(row)).toBe("Projects");
  });

  it("gives an address that is no page no Tab", async () => {
    storeTabs(alice.id, [["/projects", "Projects"]], "/projects");
    renderAt("/nowhere");

    const row = await tabRow();
    expect(tabNames(row)).toEqual(["Projects"]);
    expect(selectedTab(row)).toBeNull();
  });
});

describe("the Desktop app's Tabs between starts", () => {
  it("are restored, going back to the Tab the User was on", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects/APO", "Apollo"],
      ],
      "/projects/APO",
    );
    renderAt("/");

    const row = await tabRow();
    expect(tabNames(row)).toEqual(["Home", "Apollo"]);
    expect(address()).toBe("/projects/APO");
    expect(selectedTab(row)).toBe("Apollo");
  });

  it("show their saved names before their pages are opened", async () => {
    storeTabs(
      alice.id,
      [
        ["/projects", "Projects"],
        ["/projects/APO", "Apollo"],
      ],
      "/projects",
    );
    renderAt("/projects");

    const row = await tabRow();
    expect(tabNames(row)).toEqual(["Projects", "Apollo"]);
    expect(api.project).not.toHaveBeenCalled();
  });

  it("are saved for the User as they change", async () => {
    renderAt("/projects/APO");

    const row = await tabRow();
    await within(row).findByRole("link", { name: "Apollo" });
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", {
        name: "Projects",
      }),
    );
    expect(storedTabs(alice.id)).toEqual({
      tabs: [
        { path: "/projects/APO", title: "Apollo" },
        { path: "/projects", title: "Projects" },
      ],
      selected: "/projects",
    });
  });

  it("are the User's own: another User on this computer never sees them", async () => {
    storeTabs(bob.id, [["/projects/APO", "Apollo"]], "/projects/APO");
    renderAt("/projects");

    const row = await tabRow();
    expect(tabNames(row)).toEqual(["Projects"]);
    expect(storedTabs(bob.id)).toEqual({
      tabs: [{ path: "/projects/APO", title: "Apollo" }],
      selected: "/projects/APO",
    });
  });

  it("drop a page that is no longer one, such as Settings or an old address", async () => {
    storeTabs(
      alice.id,
      [
        ["/settings/roles", "Roles & access"],
        ["/nowhere", "Nowhere"],
        ["/projects", "Projects"],
      ],
      "/settings/roles",
    );
    renderAt("/projects");

    const row = await tabRow();
    expect(tabNames(row)).toEqual(["Projects"]);
  });

  it("keep a project the User may no longer open, which shows Not found", async () => {
    storeTabs(alice.id, [["/projects/GONE", "Old project"]], "/projects/GONE");
    renderAt("/");

    const row = await tabRow();
    expect(await screen.findByRole("heading", { name: "Project not found." })).toBeTruthy();
    expect(tabNames(row)).toEqual(["Old project"]);
  });

  it("are never made for signed-out pages", async () => {
    renderAt("/login", null);

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Tabs" })).toBeNull();
    expect(Object.keys(localStorage).filter((key) => key.startsWith("nimbus-tabs"))).toEqual([]);
  });
});
