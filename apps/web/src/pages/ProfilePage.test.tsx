// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { toast } from "@repo/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, type User } from "../api/client";
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

function session(user: User, overrides: Partial<Session> = {}): Session {
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
    changePassword: unused,
    verifyEmail: unused,
    confirmingEmail: false,
    finishVerifying: () => {},
    logout: unused,
    ...overrides,
  };
}

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreMatchMedia();
});

function show(value: Session = session(alice), path = "/settings/profile") {
  render(
    <NimbusThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={createQueryClient()}>
          <SessionContext value={value}>
            <AppRoutes />
          </SessionContext>
        </QueryClientProvider>
      </MemoryRouter>
    </NimbusThemeProvider>,
  );
}

async function openChangeEmail() {
  const card = await screen.findByRole("region", { name: "Account" });
  fireEvent.click(within(card).getByRole("button", { name: "Change email" }));
  return screen.findByRole("dialog");
}

function sendCodeTo(dialog: HTMLElement, email: string) {
  fireEvent.change(within(dialog).getByRole("textbox", { name: "New email" }), {
    target: { value: email },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Send code" }));
}

function paste(dialog: HTMLElement, code: string) {
  const [first] = within(dialog).getAllByRole("textbox");
  fireEvent.paste(first!, { clipboardData: { getData: () => code } });
}

describe("the Profile page", () => {
  it("shows the name, the verified email and the password on one card", async () => {
    show();

    const card = await screen.findByRole("region", { name: "Account" });
    const rows = within(card).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toContain("Display name");
    expect(within(rows[0]!).getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(rows[1]!.textContent).toContain("alice@example.com");
    expect(within(rows[1]!).getByText("Verified")).toBeTruthy();
    expect(within(rows[1]!).getByRole("button", { name: "Change email" })).toBeTruthy();
    expect(within(rows[2]!).getByRole("button", { name: "Change password" })).toBeTruthy();
  });

  it("says when the password was last changed, and nothing when that isn't known", async () => {
    const changed = new Date(Date.now() - 95 * 24 * 3_600_000).toISOString();
    show(session({ ...alice, passwordChangedAt: changed }));

    const card = await screen.findByRole("region", { name: "Account" });
    expect(within(card).getAllByRole("listitem")[2]!.textContent).toContain(
      "Last changed 3 months ago",
    );
    cleanup();

    show();
    const unknown = await screen.findByRole("region", { name: "Account" });
    expect(within(unknown).getAllByRole("listitem")[2]!.textContent).not.toContain("Last changed");
  });

  it("renames the User in a window", async () => {
    const updateDisplayName = vi.fn(unused);
    const success = vi.spyOn(toast, "success");
    show(session(alice, { updateDisplayName }));

    const card = await screen.findByRole("region", { name: "Account" });
    fireEvent.click(within(card).getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    const name = within(dialog).getByRole("textbox", { name: "Display name" });
    expect((name as HTMLInputElement).value).toBe("Alice");
    fireEvent.change(name, { target: { value: "  Alice A " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(updateDisplayName).toHaveBeenCalledWith("Alice A");
    expect(success).toHaveBeenCalledWith("Display name saved.");
  });
});

describe("the password window", () => {
  async function openPassword(button: string) {
    const card = await screen.findByRole("region", { name: "Account" });
    fireEvent.click(within(card).getByRole("button", { name: button }));
    return screen.findByRole("dialog");
  }

  it("changes the password with the current one and says other devices were signed out", async () => {
    const changePassword = vi.fn(unused);
    const success = vi.spyOn(toast, "success");
    show(session(alice, { changePassword }));

    const dialog = await openPassword("Change password");
    fireEvent.change(within(dialog).getByLabelText("Current password"), {
      target: { value: "old secret" },
    });
    fireEvent.change(within(dialog).getByLabelText("New password"), {
      target: { value: "new secret" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: "old secret",
      newPassword: "new secret",
    });
    expect(success).toHaveBeenCalledWith("Password updated. Other devices were signed out.");
  });

  it("says a wrong current password isn't right, and a short new one breaks the rule", async () => {
    const changePassword = vi.fn(() =>
      Promise.reject(
        new ApiError(400, "Invalid", { currentPassword: "The current password is wrong" }),
      ),
    );
    show(session(alice, { changePassword }));

    const dialog = await openPassword("Change password");
    fireEvent.change(within(dialog).getByLabelText("Current password"), {
      target: { value: "wrong" },
    });
    fireEvent.change(within(dialog).getByLabelText("New password"), {
      target: { value: "short" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Update password" }));
    expect(await within(dialog).findByText("Use 8 to 128 characters")).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText("New password"), {
      target: { value: "long enough" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Update password" }));
    expect(await within(dialog).findByText("That password isn’t right.")).toBeTruthy();
  });

  it("lets a User who signs in with Google set a first password", async () => {
    const changePassword = vi.fn(unused);
    const success = vi.spyOn(toast, "success");
    show(session({ ...alice, hasPassword: false }, { changePassword }));

    const dialog = await openPassword("Set a password");
    expect(within(dialog).queryByLabelText("Current password")).toBeNull();
    expect(within(dialog).getByText("Google and GitHub stay connected.")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("New password"), {
      target: { value: "new secret" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Set password" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: undefined,
      newPassword: "new secret",
    });
    expect(success).toHaveBeenCalledWith("Password set.");
  });

  it("opens from the old Password page's address", async () => {
    show(session(alice), "/settings/password");

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Change password")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Profile" })).toBeTruthy();
  });
});

describe("Change email", () => {
  it("sends a code to the new address and the right code changes the email", async () => {
    const request = vi.spyOn(api, "requestEmailChange").mockResolvedValue();
    const changeEmail = vi.fn(unused);
    const success = vi.spyOn(toast, "success");
    show(session(alice, { changeEmail }));

    const dialog = await openChangeEmail();
    expect(within(dialog).getByText("alice@example.com")).toBeTruthy();
    sendCodeTo(dialog, " new@example.com ");

    await within(dialog).findByText("Check your new inbox");
    expect(request).toHaveBeenCalledWith("new@example.com");
    expect(dialog.textContent).toContain("We sent a 6-digit code to new@example.com");
    expect(within(dialog).getByText("Resend code in 1:00")).toBeTruthy();
    paste(dialog, "123456");
    fireEvent.click(within(dialog).getByRole("button", { name: "Change email" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(changeEmail).toHaveBeenCalledWith("123456");
    expect(success).toHaveBeenCalledWith("Email changed to new@example.com");
  });

  it("says when the address is already the User's or someone else's", async () => {
    vi.spyOn(api, "requestEmailChange")
      .mockRejectedValueOnce(new ApiError(400, "Same", {}, null, "same_email"))
      .mockRejectedValueOnce(new ApiError(409, "Taken", {}, null, "email_taken"));
    show();

    const dialog = await openChangeEmail();
    sendCodeTo(dialog, "alice@example.com");
    expect(await within(dialog).findByText("That’s already your email.")).toBeTruthy();
    sendCodeTo(dialog, "maya@example.com");
    expect(
      await within(dialog).findByText("That email is already used by another Nimbus account."),
    ).toBeTruthy();
  });

  it("shows the wait when the address was sent codes too fast", async () => {
    vi.spyOn(api, "requestEmailChange").mockRejectedValue(new ApiError(429, "Too many", {}, 48));
    show();

    const dialog = await openChangeEmail();
    sendCodeTo(dialog, "new@example.com");

    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "Too many codes sent to this address. Try again in 0:48.",
    );
    expect(within(dialog).getByRole("button", { name: "Send code" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("asks a User whose sign-in is too old to sign in again", async () => {
    vi.spyOn(api, "requestEmailChange").mockRejectedValue(
      new ApiError(403, "Sign in again", {}, null, "reauth_required"),
    );
    show();

    const dialog = await openChangeEmail();
    sendCodeTo(dialog, "new@example.com");

    expect(await screen.findByText("Sign in again to change your email")).toBeTruthy();
  });

  it("says how many tries are left after a wrong code", async () => {
    vi.spyOn(api, "requestEmailChange").mockResolvedValue();
    const changeEmail = vi.fn(() =>
      Promise.reject(new ApiError(400, "Wrong", {}, null, "invalid_code", 3)),
    );
    show(session(alice, { changeEmail }));

    const dialog = await openChangeEmail();
    sendCodeTo(dialog, "new@example.com");
    await within(dialog).findByText("Check your new inbox");
    paste(dialog, "123456");
    fireEvent.click(within(dialog).getByRole("button", { name: "Change email" }));

    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "That code didn’t match. 3 tries left.",
    );
  });

  it("offers a new code when the code expired, and a different email", async () => {
    const request = vi.spyOn(api, "requestEmailChange").mockResolvedValue();
    const changeEmail = vi.fn(() =>
      Promise.reject(new ApiError(400, "Expired", {}, null, "code_expired")),
    );
    show(session(alice, { changeEmail }));

    const dialog = await openChangeEmail();
    sendCodeTo(dialog, "new@example.com");
    await within(dialog).findByText("Check your new inbox");
    paste(dialog, "123456");
    fireEvent.click(within(dialog).getByRole("button", { name: "Change email" }));

    await within(dialog).findByText("This code has expired");
    fireEvent.click(within(dialog).getByRole("button", { name: "Send a new code" }));
    await within(dialog).findByText("Check your new inbox");
    expect(request).toHaveBeenCalledTimes(2);

    fireEvent.click(within(dialog).getByRole("button", { name: "Use a different email" }));
    expect(await within(dialog).findByRole("textbox", { name: "New email" })).toBeTruthy();
  });

  it("goes back to the address when it was taken before the code was entered", async () => {
    vi.spyOn(api, "requestEmailChange").mockResolvedValue();
    const changeEmail = vi.fn(() =>
      Promise.reject(new ApiError(409, "Taken", {}, null, "email_taken")),
    );
    show(session(alice, { changeEmail }));

    const dialog = await openChangeEmail();
    sendCodeTo(dialog, "new@example.com");
    await within(dialog).findByText("Check your new inbox");
    paste(dialog, "123456");
    fireEvent.click(within(dialog).getByRole("button", { name: "Change email" }));

    expect(
      await within(dialog).findByText("That email is already used by another Nimbus account."),
    ).toBeTruthy();
  });
});
