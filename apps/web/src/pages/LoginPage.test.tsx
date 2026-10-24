// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type User } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { SessionContext, type Session } from "../auth/useSession";
import { AppRoutes } from "../App";

const alice: User = {
  id: "u1",
  email: "alice@example.com",
  displayName: "Alice",
  avatarUrl: null,
  hasPassword: true,
  emailVerified: true,
  passwordChangedAt: null,
};

const unused = () => Promise.resolve();

type Fakes = Pick<Session, "login" | "signInWithCode">;

/** Nobody signed in until `login` or `signInWithCode` resolves, then Alice, as the real session does. */
function FakeSession({ fakes, children }: { fakes: Fakes; children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const value: Session = {
    user,
    restoring: false,
    unavailable: null,
    signedOutOnPurpose: false,
    returnAfterSignOut: null,
    retry: () => {},
    register: unused,
    login: async (input) => {
      const outcome = await fakes.login(input);
      if (outcome === "signed-in") setUser(alice);
      return outcome;
    },
    signInWithCode: async (answer, rememberBrowser) => {
      await fakes.signInWithCode(answer, rememberBrowser);
      setUser(alice);
    },
    updateDisplayName: unused,
    changeEmail: unused,
    changePassword: unused,
    verifyEmail: unused,
    confirmingEmail: false,
    finishVerifying: () => {},
    logout: unused,
  };
  return <SessionContext value={value}>{children}</SessionContext>;
}

/** Where the app is now, so a test can see what a navigation kept. */
function Address() {
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  return (
    <output data-testid="address" data-notice={notice}>
      {location.pathname + location.search}
    </output>
  );
}

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
  // The signed-in pages a success lands on load data; none is needed here.
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
  restoreMatchMedia();
});

function show(path: string, fakes: Partial<Fakes> = {}) {
  const all: Fakes = {
    login: fakes.login ?? (() => Promise.resolve("two-step")),
    signInWithCode: fakes.signInWithCode ?? unused,
  };
  render(
    <NimbusThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={createQueryClient()}>
          <FakeSession fakes={all}>
            <AppRoutes />
            <Address />
          </FakeSession>
        </QueryClientProvider>
      </MemoryRouter>
    </NimbusThemeProvider>,
  );
}

function address() {
  return screen.getByTestId("address").textContent;
}

async function signInWithPassword() {
  fireEvent.change(await screen.findByLabelText("Email"), {
    target: { value: "alice@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct horse" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

/** Pastes a code into the first of the six boxes, as a person copying it from their app would. */
function paste(code: string) {
  const [first] = screen.getAllByRole("textbox");
  fireEvent.paste(first!, { clipboardData: { getData: () => code } });
}

function codeBoxes(): string[] {
  return screen.getAllByRole("textbox").map((box) => (box as HTMLInputElement).value);
}

const verify = () => fireEvent.click(screen.getByRole("button", { name: "Verify" }));

describe("the sign-in page", () => {
  it("goes to the code page, keeping returnTo, when the User has Two-step verification", async () => {
    show("/login?returnTo=%2Fsettings%2Fsecurity");

    await signInWithPassword();

    expect(await screen.findByRole("heading", { name: "Two-step verification" })).toBeTruthy();
    expect(screen.getByText("Enter the 6-digit code from your authenticator app")).toBeTruthy();
    expect(address()).toBe("/login/two-step?returnTo=%2Fsettings%2Fsecurity");
  });

  it("leaves an earlier Google or GitHub error behind on the way to the code page and back", async () => {
    show("/login?error=disconnected&provider=google&returnTo=%2Fsettings");

    await signInWithPassword();

    await screen.findByRole("heading", { name: "Two-step verification" });
    expect(address()).toBe("/login/two-step?returnTo=%2Fsettings");
    fireEvent.click(screen.getByRole("link", { name: "Back to sign in" }));
    await screen.findByRole("heading", { name: "Welcome back" });
    expect(address()).toBe("/login?returnTo=%2Fsettings");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("signs a User without Two-step verification straight in", async () => {
    show("/login?returnTo=%2Fnowhere", { login: () => Promise.resolve("signed-in") });

    await signInWithPassword();

    await waitFor(() => expect(address()).toBe("/nowhere"));
    expect(screen.queryByRole("heading", { name: "Two-step verification" })).toBeNull();
  });
});

describe("the two-step sign-in page", () => {
  it("takes a pasted code and continues to returnTo", async () => {
    const signInWithCode = vi.fn(unused);
    show("/login/two-step?returnTo=%2Fnowhere", { signInWithCode });

    paste("123456");
    expect(codeBoxes()).toEqual(["1", "2", "3", "4", "5", "6"]);
    verify();

    await waitFor(() => expect(address()).toBe("/nowhere"));
    expect(signInWithCode).toHaveBeenCalledWith({ code: "123456" }, false);
  });

  it("sends “Don’t ask again on this device for 30 days” when it is ticked", async () => {
    const signInWithCode = vi.fn(unused);
    show("/login/two-step", { signInWithCode });

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Don’t ask again on this device for 30 days" }),
    );
    paste("123456");
    verify();

    await waitFor(() => expect(signInWithCode).toHaveBeenCalledWith({ code: "123456" }, true));
  });

  it("offers and sends the tick with a Recovery code too, kept when switching", async () => {
    const signInWithCode = vi.fn(unused);
    show("/login/two-step", { signInWithCode });

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Don’t ask again on this device for 30 days" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Lost your phone? Use a recovery code" }));
    const tick = screen.getByRole("checkbox", {
      name: "Don’t ask again on this device for 30 days",
    }) as HTMLInputElement;
    expect(tick.checked).toBe(true);
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "abcd-efgh" } });
    verify();

    await waitFor(() =>
      expect(signInWithCode).toHaveBeenCalledWith({ recoveryCode: "abcd-efgh" }, true),
    );
  });

  it("keeps Verify off until all six digits are there", () => {
    show("/login/two-step");

    paste("123");

    expect(screen.getByRole("button", { name: "Verify" }).hasAttribute("disabled")).toBe(true);
  });

  it("says how many tries are left after a wrong code", async () => {
    show("/login/two-step", {
      signInWithCode: () => Promise.reject(new ApiError(400, "Wrong", {}, null, "invalid_code", 3)),
    });

    paste("123456");
    verify();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "That code isn’t right. 3 tries left.",
    );
  });

  it("sends the User back to sign in, keeping returnTo, when the sign-in timed out", async () => {
    show("/login/two-step?returnTo=%2Fsettings", {
      signInWithCode: () =>
        Promise.reject(new ApiError(401, "Expired", {}, null, "sign_in_expired")),
    });

    paste("123456");
    verify();

    expect(await screen.findByText("Your sign-in timed out. Sign in again.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeTruthy();
    expect(address()).toBe("/login?returnTo=%2Fsettings");
    // Shown once: a reload of this history entry doesn't say it again.
    await waitFor(() =>
      expect(screen.getByTestId("address").getAttribute("data-notice")).toBeNull(),
    );
    expect(screen.getByText("Your sign-in timed out. Sign in again.")).toBeTruthy();
  });

  it("shows the wait as m:ss while the User is locked out of code checks", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    show("/login/two-step", {
      signInWithCode: () => Promise.reject(new ApiError(429, "Too many", {}, 125)),
    });

    paste("123456");
    verify();

    expect(await screen.findByText("Too many attempts. Try again in 2:05.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Verify" }).hasAttribute("disabled")).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("Too many attempts. Try again in 2:04.")).toBeTruthy();
  });

  it("has a way back to the sign-in page that keeps returnTo", () => {
    show("/login/two-step?returnTo=%2Fsettings");

    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe(
      "/login?returnTo=%2Fsettings",
    );
  });
});

describe("the recovery code version of the two-step sign-in page", () => {
  const useRecoveryCode = () =>
    fireEvent.click(screen.getByRole("button", { name: "Lost your phone? Use a recovery code" }));

  it("swaps the code boxes for one box and back", () => {
    show("/login/two-step");

    useRecoveryCode();

    expect(screen.getByRole("heading", { name: "Use a recovery code" })).toBeTruthy();
    expect(screen.getByLabelText("Recovery code")).toBeTruthy();
    expect(screen.queryByLabelText(/Sign-in code digit/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Use your authenticator app" }));

    expect(screen.getByRole("heading", { name: "Two-step verification" })).toBeTruthy();
    expect(screen.queryByLabelText("Recovery code")).toBeNull();
    expect(codeBoxes()).toHaveLength(6);
  });

  it("signs in with a Recovery code and continues to returnTo", async () => {
    const signInWithCode = vi.fn(unused);
    show("/login/two-step?returnTo=%2Fnowhere", { signInWithCode });

    useRecoveryCode();
    expect(screen.getByRole("button", { name: "Verify" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "K7QX 2M9D" } });
    verify();

    await waitFor(() => expect(address()).toBe("/nowhere"));
    expect(signInWithCode).toHaveBeenCalledWith({ recoveryCode: "K7QX 2M9D" }, false);
  });

  it("keeps the kind of code while one is checked, so its answer shows under the right box", async () => {
    let refuse: (failure: unknown) => void = () => {};
    show("/login/two-step", {
      signInWithCode: () => new Promise((_, reject) => (refuse = reject)),
    });

    useRecoveryCode();
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "k7qx-2m9d" } });
    verify();
    fireEvent.click(screen.getByRole("button", { name: "Use your authenticator app" }));

    expect(screen.getByRole("heading", { name: "Use a recovery code" })).toBeTruthy();
    await act(async () => refuse(new ApiError(400, "Wrong", {}, null, "invalid_code", 4)));
    expect(screen.getByLabelText("Recovery code")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("That recovery code isn’t right");
  });

  it("says a wrong or used code isn't right, with the tries left", async () => {
    show("/login/two-step", {
      signInWithCode: () => Promise.reject(new ApiError(400, "Wrong", {}, null, "invalid_code", 1)),
    });

    useRecoveryCode();
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "k7qx-2m9d" } });
    verify();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "That recovery code isn’t right, or it was used already. 1 try left.",
    );
  });

  it("sends the User back to sign in when the sign-in timed out", async () => {
    show("/login/two-step?returnTo=%2Fsettings", {
      signInWithCode: () =>
        Promise.reject(new ApiError(401, "Expired", {}, null, "sign_in_expired")),
    });

    useRecoveryCode();
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "k7qx-2m9d" } });
    verify();

    expect(await screen.findByText("Your sign-in timed out. Sign in again.")).toBeTruthy();
    expect(address()).toBe("/login?returnTo=%2Fsettings");
  });

  it("shows the wait as m:ss while the User is locked out, also after switching back", async () => {
    show("/login/two-step", {
      signInWithCode: () => Promise.reject(new ApiError(429, "Too many", {}, 65)),
    });

    useRecoveryCode();
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "k7qx-2m9d" } });
    verify();

    expect(await screen.findByText("Too many attempts. Try again in 1:05.")).toBeTruthy();
    expect((screen.getByLabelText("Recovery code") as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Use your authenticator app" }));
    expect(screen.getByText(/Too many attempts. Try again in 1:0\d\./)).toBeTruthy();
  });
});
