// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { User } from "./api/client";
import { AppRoutes } from "./App";
import { createQueryClient } from "./api/queryClient";
import { SessionContext, type Session } from "./auth/useSession";

const alice: User = {
  id: "u1",
  email: "alice@example.com",
  displayName: "Alice",
  avatarUrl: null,
  hasPassword: true,
  emailVerified: true,
};

const unused = () => Promise.resolve();

/** A session that has finished loading: Alice signed in, or nobody. */
function session(user: User | null): Session {
  return {
    user,
    restoring: false,
    unavailable: null,
    signedOutOnPurpose: false,
    retry: () => {},
    register: unused,
    login: unused,
    updateDisplayName: unused,
    changePassword: unused,
    verifyEmail: unused,
    logout: unused,
  };
}

/** The app's page at an address, as the server would draw it first. */
function pageAt(path: string, user: User | null): string {
  return renderToStaticMarkup(
    <NimbusThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={createQueryClient()}>
          <SessionContext value={session(user)}>
            <AppRoutes />
          </SessionContext>
        </QueryClientProvider>
      </MemoryRouter>
    </NimbusThemeProvider>,
  );
}

// The theme reads the system's light or dark setting, which jsdom lacks.
let restoreMatchMedia: () => void;
beforeAll(() => {
  restoreMatchMedia = stubMatchMedia();
});
afterAll(() => restoreMatchMedia());

/** The navbar's Home link: there only inside the signed-in shell. */
const NAVBAR = 'data-nav-focus="home"';

describe("the app's routes", () => {
  it("shows the not-found page, inside the navbar, at an address that doesn't exist", () => {
    const page = pageAt("/projects/nope", alice);

    expect(page).toContain("This page isn’t here.");
    expect(page).toContain(NAVBAR);
  });

  it("shows the session-expired page without the navbar, its Sign in returning to where the User was", () => {
    const page = pageAt("/session-expired?returnTo=%2Fsettings%2Froles", null);

    expect(page).toContain("Your session expired.");
    expect(page).toContain('href="/login?returnTo=%2Fsettings%2Froles"');
    expect(page).not.toContain(NAVBAR);
  });

  it("never sends Sign in on the session-expired page to another site", () => {
    const page = pageAt("/session-expired?returnTo=%2F%2Fevil.example", null);

    expect(page).toContain('href="/login"');
    expect(page).not.toContain("evil");
  });
});
