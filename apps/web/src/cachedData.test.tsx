// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type Role, type RoleSummary, type User } from "./api/client";
import { createQueryClient } from "./api/queryClient";
import { SessionProvider } from "./auth/session";
import { useSession } from "./auth/useSession";
import RolesPage from "./pages/RolesPage";

const alpha: RoleSummary = {
  key: "alpha",
  name: "Alpha",
  description: "",
  kind: "project",
  builtIn: false,
  customised: false,
  permissions: 2,
  holders: 0,
};

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
  // Mantine's tabs measure themselves, and jsdom can't.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreMatchMedia();
});

/** A page as the app draws it: its theme, address and cache. The cache outlives the page, as it does in the app. */
function show(client: ReturnType<typeof createQueryClient>, page: React.ReactNode) {
  return render(
    <NimbusThemeProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>{page}</MemoryRouter>
      </QueryClientProvider>
    </NimbusThemeProvider>,
  );
}

describe("returning to a page", () => {
  it("shows what it loaded last time at once, and refreshes it in the background", async () => {
    const roles = vi.spyOn(api, "roles").mockResolvedValueOnce([alpha]);
    const client = createQueryClient();
    const first = show(client, <RolesPage />);
    await screen.findByText("Alpha");
    first.unmount();

    // The refresh is slow: whatever shows now comes from the cache.
    roles.mockReturnValueOnce(new Promise(() => {}));
    show(client, <RolesPage />);

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(document.querySelector("[aria-busy='true']")).toBeNull();
    expect(roles).toHaveBeenCalledTimes(2);
  });
});

describe("changing a Role", () => {
  it("refreshes the list that shows it, without a reload", async () => {
    const beta: Role = {
      key: "beta",
      name: "Beta",
      description: "",
      kind: "project",
      builtIn: false,
      customised: false,
      holders: 0,
      version: 0,
      locked: false,
      grants: [],
      newPermissions: [],
    };
    vi.spyOn(api, "roles")
      .mockResolvedValueOnce([alpha])
      .mockResolvedValueOnce([alpha, { ...beta, permissions: 0 }]);
    vi.spyOn(api, "createRole").mockResolvedValue(beta);
    // The page stays up after the new Role opens, so what changes is the list the User was looking at.
    show(createQueryClient(), <RolesPage />);
    await screen.findByText("Alpha");

    fireEvent.click(screen.getByRole("button", { name: "+ New Role" }));
    fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: "Beta" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Role/ }));

    expect(await screen.findByText("Beta")).toBeTruthy();
    // The window closes with a transition; finishing before it ends leaves its timer running after the test.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("a different User", () => {
  const user = (id: string, displayName: string): User => ({
    id,
    displayName,
    email: `${id}@example.com`,
    avatarUrl: null,
    hasPassword: true,
    emailVerified: true,
  });

  /** Signs out and in as the other User, with the Roles page up for whoever is signed in. */
  function Harness() {
    const { user, logout, login } = useSession();
    return (
      <>
        <button onClick={() => void logout()}>Sign out</button>
        <button onClick={() => void login({ email: "bob@example.com", password: "x" })}>
          Sign in as Bob
        </button>
        {user && <RolesPage key={user.id} />}
      </>
    );
  }

  it("never sees what the User before them loaded", async () => {
    vi.spyOn(api, "refresh").mockResolvedValue(user("alice", "Alice"));
    vi.spyOn(api, "logout").mockResolvedValue(undefined);
    vi.spyOn(api, "login").mockResolvedValue(user("bob", "Bob"));
    // Alice's Roles load; Bob's never arrive.
    vi.spyOn(api, "roles")
      .mockResolvedValueOnce([alpha])
      .mockReturnValue(new Promise(() => {}));
    show(
      createQueryClient(),
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );
    await screen.findByText("Alpha");

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.queryByText("Alpha")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Sign in as Bob" }));

    // Bob's page is up, waiting for his Roles.
    await screen.findByRole("heading", { name: "Roles & access" });
    expect(screen.queryByText("Alpha")).toBeNull();
  });
});
