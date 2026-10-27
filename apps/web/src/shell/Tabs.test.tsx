// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
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

/** The address the app is on, shown so a test can read it, and Back, as the mouse's back button would do. */
function Address() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="address">{location.pathname + location.search}</output>
      <button type="button" data-testid="back" onClick={() => void navigate(-1)} />
    </>
  );
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

/** Stores Tabs for a User, as an earlier run of the app would have left them; the selected one by its index. */
function storeTabs(userId: string, tabs: [path: string, title: string][], selected: number | null) {
  localStorage.setItem(
    `nimbus-tabs:${userId}`,
    JSON.stringify({
      tabs: tabs.map(([path, title], index) => ({ id: `t${index}`, path, title })),
      selected: selected === null ? null : `t${selected}`,
    }),
  );
}

/** A User's stored Tabs, as [path, title] pairs, and the selected one's index. */
function storedTabs(userId: string): { tabs: [string, string][]; selected: number } | null {
  const raw = localStorage.getItem(`nimbus-tabs:${userId}`);
  if (raw === null) return null;
  const stored = JSON.parse(raw) as {
    tabs: { id: string; path: string; title: string }[];
    selected: string | null;
  };
  return {
    tabs: stored.tabs.map((tab) => [tab.path, tab.title]),
    selected: stored.tabs.findIndex((tab) => tab.id === stored.selected),
  };
}

function address(): string {
  return screen.getByTestId("address").textContent ?? "";
}

/** The Tab row, once the shell's chunk has loaded. */
async function tabRow(): Promise<HTMLElement> {
  return screen.findByRole("tablist", { name: "Tabs" });
}

/** The Tabs' names, in order. */
function tabNames(row: HTMLElement): string[] {
  return within(row)
    .queryAllByRole("tab")
    .map((tab) => tab.textContent ?? "");
}

/** The selected Tab's place in the row, or -1. */
function selectedIndex(row: HTMLElement): number {
  return within(row)
    .queryAllByRole("tab")
    .findIndex((tab) => tab.getAttribute("aria-selected") === "true");
}

/** A link in the Sidebar. */
function sidebarLink(name: string): HTMLElement {
  return within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name });
}

function middleClick(element: HTMLElement) {
  fireEvent(element, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
}

/** Opens a right-click menu on `element` and picks `item` in it. */
async function pickFromMenu(element: HTMLElement, item: string) {
  fireEvent.contextMenu(element, { clientX: 40, clientY: 20 });
  // The item's name is followed by its shortcut, so it is found by its exact label.
  const label = await within(await screen.findByRole("menu")).findByText(item);
  fireEvent.click(label.closest("[role=menuitem]")!);
}

describe("the Desktop app's Tabs", () => {
  it("shows the page in a Tab named like its breadcrumb", async () => {
    renderAt("/projects/APO");

    const row = await tabRow();
    await within(row).findByRole("tab", { name: "Apollo" });
    expect(tabNames(row)).toEqual(["Apollo"]);
    expect(selectedIndex(row)).toBe(0);
  });

  it("opens a page in the selected Tab, as a browser does", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects/APO", "Apollo"],
      ],
      1,
    );
    renderAt("/projects/APO");

    const row = await tabRow();
    fireEvent.click(sidebarLink("Projects"));
    expect(address()).toBe("/projects");
    expect(tabNames(row)).toEqual(["Home", "Projects"]);
    expect(selectedIndex(row)).toBe(1);
  });

  it("leaves the query string out of a Tab", async () => {
    renderAt("/projects/APO?view=board");

    const row = await tabRow();
    await within(row).findByRole("tab", { name: "Apollo" });
    expect(storedTabs(alice.id)?.tabs).toEqual([["/projects/APO", "Apollo"]]);
  });

  it("opens a link in a new Tab after the selected one with Ctrl click, the same page twice if asked", async () => {
    storeTabs(
      alice.id,
      [
        ["/projects", "Projects"],
        ["/", "Home"],
      ],
      0,
    );
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.click(sidebarLink("Projects"), { ctrlKey: true });
    expect(tabNames(row)).toEqual(["Projects", "Projects", "Home"]);
    expect(selectedIndex(row)).toBe(1);
    expect(address()).toBe("/projects");
  });

  it("opens a link in a new Tab with ⌘ click on macOS", async () => {
    asDesktop("darwin");
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.click(sidebarLink("Home"), { metaKey: true });
    expect(tabNames(row)).toEqual(["Projects", "Home"]);
    expect(address()).toBe("/");
  });

  it("opens a link in a new Tab with a middle click", async () => {
    renderAt("/projects");

    const row = await tabRow();
    middleClick(sidebarLink("Home"));
    expect(tabNames(row)).toEqual(["Projects", "Home"]);
    expect(selectedIndex(row)).toBe(1);
  });

  it("opens Settings over the page on Ctrl click, never as a Tab", async () => {
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.click(sidebarLink("Settings"), { ctrlKey: true });
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(tabNames(row)).toEqual(["Projects"]);
  });

  it("opens a new Tab on Home with +", async () => {
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.click(screen.getByRole("button", { name: "New Tab" }));
    expect(tabNames(row)).toEqual(["Projects", "Home"]);
    expect(address()).toBe("/");
  });

  it("opens a Tab's page when the Tab is clicked, as a normal page change", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects/APO", "Apollo"],
      ],
      1,
    );
    renderAt("/projects/APO");

    const row = await tabRow();
    fireEvent.click(within(row).getByRole("tab", { name: "Home" }));
    expect(address()).toBe("/");
    expect(await screen.findByRole("heading", { name: "Welcome, Alice Example" })).toBeTruthy();
    expect(tabNames(row)).toEqual(["Home", "Apollo"]);
    expect(selectedIndex(row)).toBe(0);
  });

  it("closes a Tab with its ✕, selecting the one after it", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects", "Projects"],
        ["/projects/APO", "Apollo"],
      ],
      1,
    );
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.click(within(row).getByRole("button", { name: "Close Projects" }));
    expect(tabNames(row)).toEqual(["Home", "Apollo"]);
    expect(address()).toBe("/projects/APO");
    expect(selectedIndex(row)).toBe(1);
  });

  it("selects the one before when the last in the row closes", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects", "Projects"],
      ],
      1,
    );
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.click(within(row).getByRole("button", { name: "Close Projects" }));
    expect(address()).toBe("/");
    expect(tabNames(row)).toEqual(["Home"]);
  });

  it("selects the neighbour even when it shows the same page", async () => {
    storeTabs(
      alice.id,
      [
        ["/projects", "Projects"],
        ["/projects", "Projects"],
      ],
      0,
    );
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.click(within(row).getAllByRole("button", { name: "Close Projects" })[0]!);
    expect(tabNames(row)).toEqual(["Projects"]);
    expect(selectedIndex(row)).toBe(0);
    expect(address()).toBe("/projects");
  });

  it("stays on the page when another Tab closes", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects", "Projects"],
      ],
      1,
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
      1,
    );
    renderAt("/projects");

    const row = await tabRow();
    middleClick(within(row).getByRole("tab", { name: "Home" }));
    expect(tabNames(row)).toEqual(["Projects"]);
    expect(address()).toBe("/projects");
  });

  it("leaves the other Tabs alone on Back after switching Tabs", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects", "Projects"],
      ],
      1,
    );
    renderAt("/projects");

    const row = await tabRow();
    fireEvent.click(within(row).getByRole("tab", { name: "Home" }));
    fireEvent.click(screen.getByTestId("back"));
    expect(tabNames(row)).toEqual(["Home", "Projects"]);
  });

  it("closes the selected Tab with Ctrl W on Windows", async () => {
    storeTabs(
      alice.id,
      [
        ["/", "Home"],
        ["/projects", "Projects"],
      ],
      1,
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
      1,
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
      2,
    );
    renderAt("/projects/APO");

    const row = await tabRow();
    fireEvent.keyDown(window, { key: "Tab", code: "Tab", ctrlKey: true });
    expect(address()).toBe("/");
    fireEvent.keyDown(window, { key: "Tab", code: "Tab", ctrlKey: true, shiftKey: true });
    expect(address()).toBe("/projects/APO");
    fireEvent.keyDown(window, { key: "Tab", code: "Tab", ctrlKey: true, shiftKey: true });
    expect(address()).toBe("/projects");
    expect(selectedIndex(row)).toBe(1);
    expect(tabNames(row)).toEqual(["Home", "Projects", "Apollo"]);
  });

  it("keeps the selected Tab in view, and gives a long name in full on hover", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    try {
      renderAt("/projects/GEM");

      const row = await tabRow();
      const tab = await within(row).findByRole("tab", { name: PROJECTS.GEM!.name });
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
    fireEvent.click(sidebarLink("Settings"));
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(tabNames(row)).toEqual(["Projects"]);
    expect(selectedIndex(row)).toBe(0);
  });

  it("shows an address that is no page as Not found in the selected Tab", async () => {
    renderAt("/nowhere");

    const row = await tabRow();
    expect(tabNames(row)).toEqual(["Not found"]);
  });
});

describe("a Tab's right-click menu", () => {
  const three: [string, string][] = [
    ["/", "Home"],
    ["/projects", "Projects"],
    ["/projects/APO", "Apollo"],
  ];

  it("closes the Tab", async () => {
    storeTabs(alice.id, three, 1);
    renderAt("/projects");

    const row = await tabRow();
    await pickFromMenu(within(row).getByRole("tab", { name: "Apollo" }), "Close tab");
    expect(tabNames(row)).toEqual(["Home", "Projects"]);
    expect(address()).toBe("/projects");
  });

  it("closes the other Tabs, opening that one's page", async () => {
    storeTabs(alice.id, three, 1);
    renderAt("/projects");

    const row = await tabRow();
    await pickFromMenu(within(row).getByRole("tab", { name: "Home" }), "Close other tabs");
    expect(tabNames(row)).toEqual(["Home"]);
    expect(address()).toBe("/");
  });

  it("closes the Tabs to its right", async () => {
    storeTabs(alice.id, three, 2);
    renderAt("/projects/APO");

    const row = await tabRow();
    await pickFromMenu(within(row).getByRole("tab", { name: "Home" }), "Close tabs to the right");
    expect(tabNames(row)).toEqual(["Home"]);
    expect(address()).toBe("/");
  });

  it("duplicates the Tab, selecting the copy", async () => {
    storeTabs(alice.id, three, 0);
    renderAt("/");

    const row = await tabRow();
    await pickFromMenu(within(row).getByRole("tab", { name: "Projects" }), "Duplicate tab");
    expect(tabNames(row)).toEqual(["Home", "Projects", "Projects", "Apollo"]);
    expect(selectedIndex(row)).toBe(2);
    expect(address()).toBe("/projects");
  });

  it("acts on the Tabs as they are when picked, not as they were when it opened", async () => {
    let finish: (project: Project) => void = () => {};
    vi.mocked(api.project).mockImplementation(
      () => new Promise<Project>((resolve) => (finish = resolve)),
    );
    renderAt("/projects/APO");

    const row = await tabRow();
    fireEvent.contextMenu(within(row).getByRole("tab", { name: "APO" }), {
      clientX: 40,
      clientY: 20,
    });
    const menu = await screen.findByRole("menu");
    finish(PROJECTS.APO!);
    await within(row).findByRole("tab", { name: "Apollo" });
    fireEvent.click(within(menu).getByText("Duplicate tab").closest("[role=menuitem]")!);
    expect(tabNames(row)).toEqual(["Apollo", "Apollo"]);
  });

  it("reopens a group of closed Tabs in their order", async () => {
    storeTabs(alice.id, [...three, ["/projects/GEM", "Gemini"]], 0);
    renderAt("/");

    const row = await tabRow();
    await pickFromMenu(within(row).getByRole("tab", { name: "Home" }), "Close other tabs");
    for (let reopened = 0; reopened < 3; reopened++) {
      fireEvent.keyDown(window, { key: "T", code: "KeyT", ctrlKey: true, shiftKey: true });
    }
    expect(tabNames(row)).toEqual(["Home", "Projects", "Apollo", "Gemini"]);
  });

  it("reopens the last closed Tab where it was, as Ctrl Shift T does", async () => {
    storeTabs(alice.id, three, 0);
    renderAt("/");

    const row = await tabRow();
    fireEvent.click(within(row).getByRole("button", { name: "Close Projects" }));
    fireEvent.click(within(row).getByRole("button", { name: "Close Apollo" }));
    expect(tabNames(row)).toEqual(["Home"]);
    await pickFromMenu(within(row).getByRole("tab", { name: "Home" }), "Reopen closed tab");
    expect(tabNames(row)).toEqual(["Home", "Apollo"]);
    expect(address()).toBe("/projects/APO");
    fireEvent.keyDown(window, { key: "T", code: "KeyT", ctrlKey: true, shiftKey: true });
    expect(tabNames(row)).toEqual(["Home", "Projects", "Apollo"]);
    expect(address()).toBe("/projects");
  });
});

describe("a Sidebar link's right-click menu", () => {
  it("opens the page in a new Tab", async () => {
    renderAt("/projects");

    const row = await tabRow();
    await pickFromMenu(sidebarLink("Home"), "Open in new tab");
    expect(tabNames(row)).toEqual(["Projects", "Home"]);
    expect(address()).toBe("/");
  });

  it("opens the page in the selected Tab", async () => {
    renderAt("/projects");

    const row = await tabRow();
    await pickFromMenu(sidebarLink("Home"), "Open");
    expect(tabNames(row)).toEqual(["Home"]);
    expect(address()).toBe("/");
  });

  it("copies the page's link", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderAt("/projects");

    await tabRow();
    await pickFromMenu(sidebarLink("Projects"), "Copy link");
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/projects`);
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
      1,
    );
    renderAt("/");

    const row = await tabRow();
    expect(tabNames(row)).toEqual(["Home", "Apollo"]);
    expect(address()).toBe("/projects/APO");
    expect(selectedIndex(row)).toBe(1);
  });

  it("show their saved names before their pages are opened", async () => {
    storeTabs(
      alice.id,
      [
        ["/projects", "Projects"],
        ["/projects/APO", "Apollo"],
      ],
      0,
    );
    renderAt("/projects");

    const row = await tabRow();
    expect(tabNames(row)).toEqual(["Projects", "Apollo"]);
    expect(api.project).not.toHaveBeenCalled();
  });

  it("are saved for the User as they change", async () => {
    renderAt("/projects/APO");

    const row = await tabRow();
    await within(row).findByRole("tab", { name: "Apollo" });
    fireEvent.click(sidebarLink("Projects"), { ctrlKey: true });
    expect(storedTabs(alice.id)).toEqual({
      tabs: [
        ["/projects/APO", "Apollo"],
        ["/projects", "Projects"],
      ],
      selected: 1,
    });
  });

  it("are the User's own: another User on this computer never sees them", async () => {
    storeTabs(bob.id, [["/projects/APO", "Apollo"]], 0);
    renderAt("/projects");

    const row = await tabRow();
    expect(tabNames(row)).toEqual(["Projects"]);
    expect(storedTabs(bob.id)).toEqual({ tabs: [["/projects/APO", "Apollo"]], selected: 0 });
  });

  it("drop a page that is no longer one, such as Settings or an old address", async () => {
    storeTabs(
      alice.id,
      [
        ["/settings/roles", "Roles & access"],
        ["/nowhere", "Nowhere"],
        ["/projects", "Projects"],
      ],
      2,
    );
    renderAt("/projects");

    const row = await tabRow();
    expect(tabNames(row)).toEqual(["Projects"]);
  });

  it("keep a project the User may no longer open, which shows Not found", async () => {
    storeTabs(alice.id, [["/projects/GONE", "Old project"]], 0);
    renderAt("/");

    const row = await tabRow();
    expect(await screen.findByRole("heading", { name: "Project not found." })).toBeTruthy();
    expect(tabNames(row)).toEqual(["Old project"]);
  });

  it("are never made for signed-out pages", async () => {
    renderAt("/login", null);

    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("tablist", { name: "Tabs" })).toBeNull();
    expect(Object.keys(localStorage).filter((key) => key.startsWith("nimbus-tabs"))).toEqual([]);
  });
});
