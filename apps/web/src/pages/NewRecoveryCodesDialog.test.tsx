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

const CODES = [
  "n3wa-aaaa",
  "n3wb-bbbb",
  "n3wc-cccc",
  "n3wd-dddd",
  "n3we-eeee",
  "n3wf-ffff",
  "n3wg-gggg",
  "n3wh-hhhh",
  "n3wi-iiii",
  "n3wj-jjjj",
];

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

async function openWindow() {
  const card = await screen.findByRole("region", { name: /Two-step verification/ });
  fireEvent.click(await within(card).findByRole("button", { name: "View new codes" }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("View new recovery codes");
  return dialog;
}

function paste(dialog: HTMLElement, code: string) {
  const [first] = within(dialog).getAllByRole("textbox");
  fireEvent.paste(first!, { clipboardData: { getData: () => code } });
}

describe("View new codes", () => {
  it("asks for a Sign-in code, shows the new codes, and Done waits for them to be saved", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValueOnce(on(3)).mockResolvedValue(on(10));
    const make = vi.spyOn(api, "newRecoveryCodes").mockResolvedValue({ recoveryCodes: CODES });
    show();
    expect(await screen.findByText("3 of 10 left")).toBeTruthy();

    const dialog = await openWindow();
    paste(dialog, "123456");
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));

    await within(dialog).findByText("Save your new recovery codes");
    expect(make).toHaveBeenCalledWith("123456");
    expect(
      within(within(dialog).getByRole("list", { name: "Recovery codes" })).getAllByRole("listitem"),
    ).toHaveLength(10);
    expect(within(dialog).getByText("n3wa-aaaa")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Download .txt" })).toBeTruthy();
    // The count is back to 10 behind the window already: the old codes are gone whether or not these are saved.
    expect(await screen.findByText("10 of 10 left")).toBeTruthy();

    const done = within(dialog).getByRole("button", { name: "Done" });
    expect(done.hasAttribute("disabled")).toBe(true);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "I’ve saved these codes" }));
    expect(done.hasAttribute("disabled")).toBe(false);
    fireEvent.click(done);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("can't be closed while the new codes are unsaved, since they are never shown again", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(on(8));
    vi.spyOn(api, "newRecoveryCodes").mockResolvedValue({ recoveryCodes: CODES });
    show();
    const dialog = await openWindow();
    const closeButtons = () => dialog.querySelectorAll("button.mantine-Modal-close");
    expect(closeButtons()).toHaveLength(1);

    paste(dialog, "123456");
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    await within(dialog).findByText("Save your new recovery codes");

    expect(closeButtons()).toHaveLength(0);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "I’ve saved these codes" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says a wrong code didn't work and clears the boxes", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(on(8));
    vi.spyOn(api, "newRecoveryCodes").mockRejectedValue(
      new ApiError(400, "Wrong", {}, null, "invalid_code"),
    );
    show();

    const dialog = await openWindow();
    paste(dialog, "123456");
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));

    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "That code didn’t work. Check your authenticator app and try again.",
    );
    expect(
      within(dialog)
        .getAllByRole("textbox")
        .every((box) => (box as HTMLInputElement).value === ""),
    ).toBe(true);
    expect(within(dialog).queryByRole("list", { name: "Recovery codes" })).toBeNull();
  });

  it("shows the wait as m:ss while the User is locked out of code checks", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(on(8));
    vi.spyOn(api, "newRecoveryCodes").mockRejectedValue(new ApiError(429, "Too many", {}, 65));
    show();

    const dialog = await openWindow();
    paste(dialog, "123456");
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));

    expect(await within(dialog).findByText("Too many attempts. Try again in 1:05.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("is not offered while two-step verification is off", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue({
      enabled: false,
      enabledAt: null,
      recoveryCodesLeft: null,
    });
    show();

    await screen.findByRole("button", { name: "Set up" });
    expect(screen.queryByRole("button", { name: "View new codes" })).toBeNull();
  });
});
