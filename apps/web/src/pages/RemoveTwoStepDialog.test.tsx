// @vitest-environment jsdom
import { ApiError } from "@repo/api";
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type TwoStepStatus, type User } from "../api/client";
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

const on = (left: number): TwoStepStatus => ({
  enabled: true,
  enabledAt: "2026-10-18T09:00:00Z",
  recoveryCodesLeft: left,
});

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
  vi.spyOn(api, "sessions").mockResolvedValue([]);
  vi.spyOn(api, "providers").mockResolvedValue([]);
  vi.spyOn(api, "linkedIdentities").mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreMatchMedia();
});

function show() {
  render(
    <NimbusThemeProvider>
      <MemoryRouter initialEntries={["/settings/security"]}>
        <QueryClientProvider client={createQueryClient()}>
          <SessionContext value={session}>
            <AppRoutes />
          </SessionContext>
        </QueryClientProvider>
      </MemoryRouter>
    </NimbusThemeProvider>,
  );
}

const off: TwoStepStatus = { enabled: false, enabledAt: null, recoveryCodesLeft: null };

async function openWindow() {
  const card = await screen.findByRole("region", { name: /Two-step verification/ });
  fireEvent.click(await within(card).findByRole("button", { name: "Remove" }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("Remove two-step verification?");
  return dialog;
}

function paste(dialog: HTMLElement, code: string) {
  const [first] = within(dialog).getAllByRole("textbox");
  fireEvent.paste(first!, { clipboardData: { getData: () => code } });
}

describe("Remove two-step verification", () => {
  it("takes a Sign-in code and the card goes back to Off", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValueOnce(on(8)).mockResolvedValue(off);
    const remove = vi.spyOn(api, "turnOffTwoStep").mockResolvedValue();
    show();
    const card = await screen.findByRole("region", { name: /Two-step verification/ });
    expect(await within(card).findByText("8 of 10 left")).toBeTruthy();

    const dialog = await openWindow();
    paste(dialog, "123456");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(remove).toHaveBeenCalledWith({ code: "123456" });
    expect(await within(card).findByRole("button", { name: "Set up" })).toBeTruthy();
    expect(within(card).getByText("Off")).toBeTruthy();
    expect(within(card).queryByText("Recovery codes")).toBeNull();
    expect(within(card).queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("takes a Recovery code for a User who lost their phone", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValueOnce(on(8)).mockResolvedValue(off);
    const remove = vi.spyOn(api, "turnOffTwoStep").mockResolvedValue();
    show();

    const dialog = await openWindow();
    fireEvent.click(within(dialog).getByRole("button", { name: "Use a recovery code" }));
    const box = within(dialog).getByRole("textbox", { name: "Recovery code" });
    const submit = within(dialog).getByRole("button", { name: "Remove" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.change(box, { target: { value: "abcd-efgh" } });
    fireEvent.click(submit);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(remove).toHaveBeenCalledWith({ recoveryCode: "abcd-efgh" });
  });

  it("says a wrong code didn't work and keeps it on", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(on(8));
    vi.spyOn(api, "turnOffTwoStep").mockRejectedValue(
      new ApiError(400, "Wrong", {}, null, "invalid_code"),
    );
    show();

    const dialog = await openWindow();
    paste(dialog, "123456");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "That code didn’t work. Check your authenticator app and try again.",
    );
    expect(
      within(dialog)
        .getAllByRole("textbox")
        .every((box) => (box as HTMLInputElement).value === ""),
    ).toBe(true);

    fireEvent.click(within(dialog).getByRole("button", { name: "Use a recovery code" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Recovery code" }), {
      target: { value: "abcd-efgh" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "That recovery code isn’t right, or it was used already.",
    );
    // The refused code stays to be fixed, but can't be sent again as it is.
    const box = within(dialog).getByRole("textbox", { name: "Recovery code" });
    expect((box as HTMLInputElement).value).toBe("abcd-efgh");
    const submit = within(dialog).getByRole("button", { name: "Remove" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.change(box, { target: { value: "abcd-efgx" } });
    expect(submit.hasAttribute("disabled")).toBe(false);
  });

  it("shows the wait as m:ss while the User is locked out of code checks", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(on(8));
    vi.spyOn(api, "turnOffTwoStep").mockRejectedValue(new ApiError(429, "Too many", {}, 65));
    show();

    const dialog = await openWindow();
    paste(dialog, "123456");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(await within(dialog).findByText("Too many attempts. Try again in 1:05.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Remove" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("is not offered while two-step verification is off", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(off);
    show();

    await screen.findByRole("button", { name: "Set up" });
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });
});
