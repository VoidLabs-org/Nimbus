// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
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

/** Runs as the Desktop app on `platform`, as the preload script would make it. */
function asDesktop(platform: NimbusDesktop["platform"] = "win32") {
  window.nimbusDesktop = { platform, setTheme: vi.fn(), showAppMenu: vi.fn() };
}

// Mantine's pill tabs measure themselves; jsdom has no ResizeObserver.
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
  asDesktop();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete window.nimbusDesktop;
  window.matchMedia = realMatchMedia;
});

/** The address the app is on, shown so a test can read it. */
function Address() {
  const location = useLocation();
  return <output data-testid="address">{location.pathname}</output>;
}

function renderAt(path: string) {
  return render(
    <NimbusThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={createQueryClient()}>
          <SessionContext value={session}>
            <AppRoutes />
            <Address />
          </SessionContext>
        </QueryClientProvider>
      </MemoryRouter>
    </NimbusThemeProvider>,
  );
}

function address(): string {
  return screen.getByTestId("address").textContent ?? "";
}

/** The "Search or jump to…" box in the title row, once the shell's chunk has loaded. */
async function jumpBox(): Promise<HTMLElement> {
  return screen.findByRole("button", { name: /Search or jump to/ });
}

/** Opens Jump from its box and returns the dialog. */
async function openJump(): Promise<HTMLElement> {
  fireEvent.click(await jumpBox());
  return screen.findByRole("dialog", { name: "Jump" });
}

/** The listed pages' names, in order. */
function results(dialog: HTMLElement): string[] {
  return within(dialog)
    .queryAllByRole("option")
    .map((option) => option.querySelector("[data-label]")?.textContent ?? "");
}

/** The listed items' names by group heading, in order. */
function groups(dialog: HTMLElement): Record<string, string[]> {
  return Object.fromEntries(
    within(dialog)
      .queryAllByRole("group")
      .map((group) => [
        group.getAttribute("aria-label") ?? "",
        within(group)
          .getAllByRole("option")
          .map((option) => option.querySelector("[data-label]")?.textContent ?? ""),
      ]),
  );
}

/** The Tabs' names, in order. */
function tabNames(): string[] {
  return within(screen.getByRole("tablist", { name: "Tabs" }))
    .getAllByRole("tab")
    .map((tab) => tab.textContent ?? "");
}

function search(dialog: HTMLElement): HTMLElement {
  return within(dialog).getByRole("combobox", { name: "Search or jump to…" });
}

describe("opening and closing Jump", () => {
  it("opens from the box in the title row, which names its shortcut", async () => {
    renderAt("/");

    const box = await jumpBox();
    expect(box.textContent).toContain("Ctrl K");
    fireEvent.click(box);
    const dialog = await screen.findByRole("dialog", { name: "Jump" });
    expect(document.activeElement).toBe(search(dialog));
  });

  it("names ⌘ K on macOS", async () => {
    asDesktop("darwin");
    renderAt("/");

    expect((await jumpBox()).textContent).toContain("⌘ K");
  });

  it("opens with Ctrl K, and ⌘ K on macOS", async () => {
    renderAt("/");
    await jumpBox();

    fireEvent.keyDown(window, { key: "k", code: "KeyK", ctrlKey: true });
    expect(await screen.findByRole("dialog", { name: "Jump" })).toBeTruthy();
    cleanup();

    asDesktop("darwin");
    renderAt("/");
    await jumpBox();
    fireEvent.keyDown(window, { key: "k", code: "KeyK", metaKey: true });
    expect(await screen.findByRole("dialog", { name: "Jump" })).toBeTruthy();
  });

  it("closes with Esc, giving the focus back to where it was", async () => {
    renderAt("/");
    const box = await jumpBox();
    box.focus();

    fireEvent.click(box);
    const dialog = await screen.findByRole("dialog", { name: "Jump" });
    fireEvent.keyDown(search(dialog), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Jump" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(box));
  });
});

describe("opening Jump again", () => {
  it("starts empty, with the usual places listed", async () => {
    renderAt("/");

    let dialog = await openJump();
    fireEvent.change(search(dialog), { target: { value: "secu" } });
    fireEvent.keyDown(search(dialog), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Jump" })).toBeNull());

    dialog = await openJump();
    expect((search(dialog) as HTMLInputElement).value).toBe("");
    expect(results(dialog)).toContain("Home");
  });
});

describe("what Jump lists", () => {
  it("offers places to go and actions before anything is typed", async () => {
    renderAt("/");

    const dialog = await openJump();
    expect(groups(dialog)).toEqual({
      "Go to": ["Home", "Projects"],
      Actions: ["New project", "Switch to Ink theme", "Fold the Sidebar", "Open Settings"],
    });
  });

  it("finds pages, Settings pages and actions by name, best matches first in each group", async () => {
    renderAt("/");

    const dialog = await openJump();
    fireEvent.change(search(dialog), { target: { value: "pro" } });
    expect(groups(dialog)).toEqual({
      Pages: ["Projects"],
      Settings: ["Profile"],
      Actions: ["New project"],
    });
    fireEvent.change(search(dialog), { target: { value: "ECU" } });
    expect(groups(dialog)).toEqual({ Settings: ["Security"] });
  });

  it("marks what matched in each name", async () => {
    renderAt("/");

    const dialog = await openJump();
    fireEvent.change(search(dialog), { target: { value: "ecu" } });
    const option = within(dialog).getByRole("option", { name: /Security/ });
    expect(option.querySelector("mark")?.textContent).toBe("ecu");
  });

  it("lists Roles & access and the Audit log only for a User with their Permissions", async () => {
    renderAt("/");
    let dialog = await openJump();
    fireEvent.change(search(dialog), { target: { value: "audit" } });
    expect(results(dialog)).toEqual([]);
    cleanup();

    vi.mocked(api.myPlatformPermissions).mockResolvedValue([
      "access:role:manage",
      "access:audit:view",
    ]);
    renderAt("/");
    dialog = await openJump();
    fireEvent.change(search(dialog), { target: { value: "a" } });
    await waitFor(() => expect(results(dialog)).toContain("Audit log"));
    expect(results(dialog)).toContain("Roles & access");
  });

  it("says when nothing matches, pointing to the commands", async () => {
    renderAt("/");

    const dialog = await openJump();
    fireEvent.change(search(dialog), { target: { value: "zebra" } });
    expect(results(dialog)).toEqual([]);
    expect(within(dialog).getByText("No results for “zebra”")).toBeTruthy();
    expect(within(dialog).getByText("Type > for commands.")).toBeTruthy();
  });

  it("shows only actions after >, saying so", async () => {
    renderAt("/");

    const dialog = await openJump();
    fireEvent.change(search(dialog), { target: { value: ">" } });
    expect(groups(dialog)).toEqual({
      Actions: [
        "New project",
        "Switch to Ink theme",
        "Fold the Sidebar",
        "Open Settings",
        "Sign out",
      ],
    });
    expect(within(dialog).getByText("Commands")).toBeTruthy();
    fireEvent.change(search(dialog), { target: { value: "> pro" } });
    expect(groups(dialog)).toEqual({ Actions: ["New project"] });
  });

  it("names each action's shortcut, and the keys in its footer", async () => {
    renderAt("/");

    const dialog = await openJump();
    const fold = within(dialog).getByRole("option", { name: /Fold the Sidebar/ });
    expect(fold.textContent).toContain("Ctrl \\");
    expect(within(dialog).getByText("New tab")).toBeTruthy();
    expect(within(dialog).getByText("Ctrl ↵")).toBeTruthy();
  });
});

describe("opening a page from Jump", () => {
  it("moves through the list with the arrow keys and opens the highlighted page with Enter", async () => {
    renderAt("/");

    const dialog = await openJump();
    const field = search(dialog);
    const highlighted = () =>
      document
        .getElementById(field.getAttribute("aria-activedescendant") ?? "")
        ?.querySelector("[data-label]")?.textContent;
    expect(highlighted()).toBe("Home");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(highlighted()).toBe("Projects");
    fireEvent.keyDown(field, { key: "ArrowUp" });
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(highlighted()).toBe("Open Settings");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(address()).toBe("/projects");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Jump" })).toBeNull());
  });

  it("opens a page in the selected Tab", async () => {
    renderAt("/");

    const dialog = await openJump();
    fireEvent.change(search(dialog), { target: { value: "projects" } });
    fireEvent.keyDown(search(dialog), { key: "Enter" });

    expect(address()).toBe("/projects");
    expect(tabNames()).toEqual(["Projects"]);
  });

  it("opens a page in a new Tab with Ctrl Enter, or ⌘ Enter on macOS", async () => {
    renderAt("/");

    let dialog = await openJump();
    fireEvent.change(search(dialog), { target: { value: "projects" } });
    fireEvent.keyDown(search(dialog), { key: "Enter", ctrlKey: true });
    expect(address()).toBe("/projects");
    expect(tabNames()).toEqual(["Home", "Projects"]);
    cleanup();
    localStorage.clear();

    asDesktop("darwin");
    renderAt("/");
    dialog = await openJump();
    fireEvent.change(search(dialog), { target: { value: "projects" } });
    fireEvent.keyDown(search(dialog), { key: "Enter", metaKey: true });
    expect(tabNames()).toEqual(["Home", "Projects"]);
  });

  it("selects the Tab already showing the page instead", async () => {
    localStorage.setItem(
      `nimbus-tabs:${alice.id}`,
      JSON.stringify({
        tabs: [
          { id: "t0", path: "/projects", title: "Projects" },
          { id: "t1", path: "/", title: "Home" },
        ],
        selected: "t1",
      }),
    );
    renderAt("/");

    const dialog = await openJump();
    fireEvent.click(within(dialog).getByRole("option", { name: /^Projects/ }));

    expect(address()).toBe("/projects");
    const tabs = within(screen.getByRole("tablist", { name: "Tabs" })).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Projects", "Home"]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it("opens a Settings page in the Settings overlay", async () => {
    renderAt("/projects");

    const dialog = await openJump();
    fireEvent.change(search(dialog), { target: { value: "appear" } });
    fireEvent.keyDown(search(dialog), { key: "Enter" });

    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(address()).toBe("/settings/appearance");
  });
});

describe("Jump while something else is open", () => {
  it("leaves the Tabs alone while Settings is open: a page opens in place, never in a new Tab", async () => {
    renderAt("/projects");
    fireEvent.click(await screen.findByRole("link", { name: "Settings" }));
    await screen.findByRole("dialog", { name: "Settings" });

    fireEvent.keyDown(window, { key: "k", code: "KeyK", ctrlKey: true });
    const dialog = await screen.findByRole("dialog", { name: "Jump" });
    fireEvent.change(search(dialog), { target: { value: "home" } });
    fireEvent.keyDown(search(dialog), { key: "Enter", ctrlKey: true });

    expect(address()).toBe("/");
    expect(tabNames()).toEqual(["Home"]);
  });

  it("keeps the Settings page open when Open Settings runs over it, as Ctrl , does", async () => {
    renderAt("/settings/security");
    await screen.findByRole("dialog", { name: "Settings" });

    fireEvent.keyDown(window, { key: "k", code: "KeyK", ctrlKey: true });
    const dialog = await screen.findByRole("dialog", { name: "Jump" });
    fireEvent.change(search(dialog), { target: { value: ">open settings" } });
    fireEvent.keyDown(search(dialog), { key: "Enter" });

    expect(address()).toBe("/settings/security");
  });

  it("closes when Ctrl , opens Settings, as picking Open Settings does", async () => {
    renderAt("/projects");
    const dialog = await openJump();

    fireEvent.keyDown(search(dialog), { key: ",", code: "Comma", ctrlKey: true });

    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Jump" })).toBeNull());
  });

  it("closes when Ctrl , is pressed over Settings, leaving its page open", async () => {
    renderAt("/settings/security");
    await screen.findByRole("dialog", { name: "Settings" });
    fireEvent.keyDown(window, { key: "k", code: "KeyK", ctrlKey: true });
    const dialog = await screen.findByRole("dialog", { name: "Jump" });

    fireEvent.keyDown(search(dialog), { key: ",", code: "Comma", ctrlKey: true });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Jump" })).toBeNull());
    expect(address()).toBe("/settings/security");
  });

  it("doesn't open over Sign out?", async () => {
    renderAt("/");
    const dialog = await openJump();
    fireEvent.change(search(dialog), { target: { value: ">sign out" } });
    fireEvent.keyDown(search(dialog), { key: "Enter" });
    await screen.findByRole("dialog", { name: "Sign out?" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Jump" })).toBeNull());

    fireEvent.keyDown(window, { key: "k", code: "KeyK", ctrlKey: true });
    // Long enough for Jump to have opened, had it been going to.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole("dialog", { name: "Jump" })).toBeNull();
  });

  it("takes Enter that ends typing with an input method (IME) as typing, not a pick", async () => {
    renderAt("/projects");

    const dialog = await openJump();
    fireEvent.keyDown(search(dialog), { key: "Enter", isComposing: true });
    expect(address()).toBe("/projects");
    expect(screen.getByRole("dialog", { name: "Jump" })).toBeTruthy();
  });
});

describe("actions in Jump", () => {
  /** Runs the action named `name` from Jump's commands. */
  async function run(name: string) {
    const dialog = await openJump();
    fireEvent.change(search(dialog), { target: { value: `>${name}` } });
    fireEvent.keyDown(search(dialog), { key: "Enter" });
  }

  it("switches between Paper and Ink", async () => {
    renderAt("/");

    await run("ink");
    expect(document.documentElement.getAttribute("data-theme")).toBe("ink");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Jump" })).toBeNull());
    const dialog = await openJump();
    expect(results(dialog)).toContain("Switch to Paper theme");
  });

  it("folds the Sidebar", async () => {
    renderAt("/");

    await run("fold");
    expect(await screen.findByRole("button", { name: "Open the Sidebar" })).toBeTruthy();
  });

  it("opens Projects for a new project, and Settings", async () => {
    renderAt("/");

    await run("new project");
    expect(address()).toBe("/projects");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Jump" })).toBeNull());
    await run("open settings");
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeTruthy();
  });

  it("asks before signing out, as the account menu does", async () => {
    const logout = vi.spyOn(session, "logout");
    renderAt("/");

    await run("sign out");
    const confirm = await screen.findByRole("dialog", { name: "Sign out?" });
    expect(logout).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
  });
});
