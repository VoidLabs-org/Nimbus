// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type User } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { SessionContext, type Session } from "../auth/useSession";
import { AppRoutes } from "../App";

const unused = () => Promise.resolve();

const signedOut: Session = {
  user: null,
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

const realMatchMedia = window.matchMedia;
beforeEach(() => {
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
  vi.spyOn(api, "providers").mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete window.nimbusDesktop;
  window.matchMedia = realMatchMedia;
});

function asDesktop() {
  window.nimbusDesktop = { platform: "win32", setTheme: vi.fn(), showAppMenu: vi.fn() };
}

/** A new User who still has to confirm their email: the app shows the verification screen. */
const newUser: User = {
  id: "u1",
  email: "alice@example.com",
  displayName: "Alice",
  avatarUrl: null,
  hasPassword: true,
  emailVerified: false,
  passwordChangedAt: null,
  hasUploadedPicture: false,
  pictureSource: "initials",
  pictureOptions: { uploadedAt: null, uploadedUrl: null, providers: [] },
};

async function renderAt(path: string, session: Session = signedOut) {
  render(
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
  await screen.findByRole("heading", { level: 1 });
}

/** The Nimbus panel beside the form: the "Backlog / to done, / with a little AI" bars. */
function nimbusPanel(): HTMLElement | null {
  return screen.queryByText("Backlog");
}

describe("the sign-in and sign-up pages in the Desktop app", () => {
  it.each(["/login", "/register", "/forgot-password", "/login/two-step"])(
    "%s shows the form alone, centred, under the logo",
    async (path) => {
      asDesktop();
      await renderAt(path);

      expect(nimbusPanel()).toBeNull();
      expect(screen.getByText("nimbus")).toBeTruthy();
    },
  );

  it.each(["/login", "/register", "/forgot-password", "/login/two-step"])(
    "%s keeps the Nimbus panel in a browser",
    async (path) => {
      await renderAt(path);

      expect(nimbusPanel()).toBeTruthy();
    },
  );

  it("shows Verify your email, after Register, the same way", async () => {
    asDesktop();
    await renderAt("/", { ...signedOut, user: newUser });

    expect(screen.getByRole("heading", { name: "Verify your email" })).toBeTruthy();
    expect(nimbusPanel()).toBeNull();
  });

  it("keeps the Nimbus panel on Verify your email in a browser", async () => {
    await renderAt("/", { ...signedOut, user: newUser });

    expect(screen.getByRole("heading", { name: "Verify your email" })).toBeTruthy();
    expect(nimbusPanel()).toBeTruthy();
  });
});
