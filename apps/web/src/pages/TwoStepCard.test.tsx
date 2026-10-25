// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider } from "@tanstack/react-query";
import QRCode from "qrcode";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, type TwoStepStatus, type User } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { SessionProvider } from "../auth/session";
import { SessionContext, type Session } from "../auth/useSession";
import { AppRoutes } from "../App";

vi.mock("../auth/redirect", () => ({ goTo: vi.fn() }));

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

function session(logout: () => Promise<void> = unused): Session {
  return {
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
    logout,
  };
}

const OFF: TwoStepStatus = { enabled: false, enabledAt: null, recoveryCodesLeft: null };

const KEY = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

const CODES = [
  "k7qx-2m9d",
  "p3vn-8hzt",
  "a1b2-c3d4",
  "e5f6-g7h8",
  "i9j0-k1l2",
  "m3n4-o5p6",
  "q7r8-s9t0",
  "u1v2-w3x4",
  "y5z6-a7b8",
  "y7ip-0sgk",
];

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
  vi.spyOn(api, "sessions").mockResolvedValue([]);
  vi.spyOn(api, "providers").mockResolvedValue([]);
  vi.spyOn(api, "linkedIdentities").mockResolvedValue([]);
  vi.spyOn(api, "discardTwoStepSetup").mockResolvedValue();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreMatchMedia();
});

function Where() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname + location.search}</output>;
}

function show(logout?: () => Promise<void>, path = "/settings/security") {
  render(
    <NimbusThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={createQueryClient()}>
          <SessionContext value={session(logout)}>
            <AppRoutes />
            <Where />
          </SessionContext>
        </QueryClientProvider>
      </MemoryRouter>
    </NimbusThemeProvider>,
  );
}

function card() {
  return screen.findByRole("region", { name: /Two-step verification/ });
}

function paste(dialog: HTMLElement, code: string) {
  const [first] = within(dialog).getAllByRole("textbox");
  fireEvent.paste(first!, { clipboardData: { getData: () => code } });
}

/** Opens the setup window and gets it to step 1. */
async function openSetup() {
  vi.spyOn(api, "startTwoStepSetup").mockResolvedValue({
    key: KEY,
    otpauthUri: `otpauth://totp/Nimbus:alice%40example.com?secret=${KEY}&issuer=Nimbus`,
  });
  fireEvent.click(await within(await card()).findByRole("button", { name: "Set up" }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("Scan with your app");
  return dialog;
}

describe("the Two-step verification card", () => {
  it("says it is off and offers Set up", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(OFF);

    show();

    const region = await card();
    await within(region).findByText("Authenticator app");
    expect(
      within(region).getByText("Ask for a code from an authenticator app when you sign in."),
    ).toBeTruthy();
    expect(within(region).getByText("Authenticator app")).toBeTruthy();
    expect(within(region).getByText("Off")).toBeTruthy();
    expect(
      within(region).getByText("Use Google Authenticator, 1Password, Authy or similar."),
    ).toBeTruthy();
    expect(within(region).getByRole("button", { name: "Set up" })).toBeTruthy();
  });

  it("shows that it is on, since when, and the Recovery codes left", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue({
      enabled: true,
      enabledAt: "2026-10-18T09:00:00Z",
      recoveryCodesLeft: 8,
    });

    show();

    const region = await card();
    await within(region).findByText("Recovery codes");
    expect(within(region).getAllByText("On").length).toBeGreaterThan(0);
    const added = new Date("2026-10-18T09:00:00Z").toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    expect(region.textContent).toContain(`Added ${added}`);
    expect(region.textContent).toContain("8 of 10 left");
    expect(within(region).queryByRole("button", { name: "Set up" })).toBeNull();
  });

  it("comes before the sessions on the page", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(OFF);

    show();

    const regions = await screen.findAllByRole("region");
    expect(regions[0]!.textContent).toContain("Two-step verification");
  });
});

describe("setting up Two-step verification", () => {
  it("shows the QR code and the key in groups of four", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(OFF);
    show();

    const dialog = await openSetup();

    expect(within(dialog).getByText("Step 1 of 2")).toBeTruthy();
    await within(dialog).findByRole("img", { name: "QR code for your authenticator app" });
    expect(within(dialog).getByText("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Copy key" })).toBeTruthy();
  });

  it("turns it on after a right code and the saved Recovery codes", async () => {
    const status = vi.spyOn(api, "twoStep").mockResolvedValue(OFF);
    const verify = vi.spyOn(api, "verifyTwoStepSetup").mockResolvedValue({ recoveryCodes: CODES });
    const turnOn = vi.spyOn(api, "turnOnTwoStep").mockResolvedValue();
    show();
    const dialog = await openSetup();

    paste(dialog, "123456");
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));

    await within(dialog).findByText("Save your recovery codes");
    expect(verify).toHaveBeenCalledWith("123456");
    expect(within(dialog).getByText("Step 2 of 2")).toBeTruthy();
    for (const code of CODES) expect(within(dialog).getByText(code)).toBeTruthy();
    const turnOnButton = within(dialog).getByRole("button", {
      name: "Turn on two-step verification",
    });
    expect((turnOnButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "I’ve saved these codes" }));
    status.mockResolvedValue({
      enabled: true,
      enabledAt: new Date().toISOString(),
      recoveryCodesLeft: 10,
    });
    fireEvent.click(turnOnButton);

    await waitFor(() => expect(turnOn).toHaveBeenCalledTimes(1));
    await within(await card()).findByText("10 of 10 left");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps step 1 and says so when the code is wrong", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(OFF);
    vi.spyOn(api, "verifyTwoStepSetup").mockRejectedValue(
      new ApiError(400, "That code didn't work.", {}, null, "invalid_code"),
    );
    show();
    const dialog = await openSetup();

    paste(dialog, "000000");
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));

    await within(dialog).findByText(
      "That code didn’t work. Check your authenticator app and try again.",
    );
    expect(within(dialog).getByText("Scan with your app")).toBeTruthy();
  });

  it("can't continue until all six digits are in", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(OFF);
    show();
    const dialog = await openSetup();

    expect(
      (within(dialog).getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("turns nothing on when the window is closed halfway", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(OFF);
    vi.spyOn(api, "verifyTwoStepSetup").mockResolvedValue({ recoveryCodes: CODES });
    const turnOn = vi.spyOn(api, "turnOnTwoStep").mockResolvedValue();
    show();
    const dialog = await openSetup();
    paste(dialog, "123456");
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    await within(dialog).findByText("Save your recovery codes");

    // Step 2 has no Cancel (design 32d): the window closes with its ✕ or Escape.
    expect(within(dialog).queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(turnOn).not.toHaveBeenCalled();
    expect(api.discardTwoStepSetup).toHaveBeenCalledTimes(1);
    expect(await within(await card()).findByRole("button", { name: "Set up" })).toBeTruthy();
  });

  it("asks the User to sign in again when the sign-in is too old", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(OFF);
    vi.spyOn(api, "startTwoStepSetup").mockRejectedValue(
      new ApiError(403, "Sign in again to do this", {}, null, "reauth_required"),
    );
    const logout = vi.fn(() => Promise.resolve());
    show(logout);

    fireEvent.click(await within(await card()).findByRole("button", { name: "Set up" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Sign in again to set up two-step verification")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign in again" }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByLabelText("location").textContent).toBe(
        "/login?returnTo=%2Fsettings%2Fsecurity%3Fsetup%3Dtwo-step",
      ),
    );
  });

  it("starts over when the setup has expired", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(OFF);
    vi.spyOn(api, "verifyTwoStepSetup").mockRejectedValue(
      new ApiError(409, "This setup has expired.", {}, null, "setup_expired"),
    );
    show();
    const dialog = await openSetup();

    paste(dialog, "123456");
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));

    await within(dialog).findByText("This setup timed out. Start again to get a new code.");
    expect(within(dialog).getByRole("button", { name: "Start again" })).toBeTruthy();
  });
});

describe("coming back after signing in again", () => {
  it("opens the setup window by itself and clears the address", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(OFF);
    const start = vi.spyOn(api, "startTwoStepSetup").mockResolvedValue({
      key: KEY,
      otpauthUri: `otpauth://totp/Nimbus:alice%40example.com?secret=${KEY}&issuer=Nimbus`,
    });

    show(undefined, "/settings/security?setup=two-step");

    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Scan with your app");
    expect(start).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByLabelText("location").textContent).toBe("/settings/security"),
    );
  });

  it("does nothing but clear the address when it is on already", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue({
      enabled: true,
      enabledAt: "2026-10-18T09:00:00Z",
      recoveryCodesLeft: 10,
    });
    const start = vi.spyOn(api, "startTwoStepSetup");

    show(undefined, "/settings/security?setup=two-step");

    await within(await card()).findByText("Recovery codes");
    await waitFor(() =>
      expect(screen.getByLabelText("location").textContent).toBe("/settings/security"),
    );
    expect(start).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("signing in again, with the app's real sign-in state", () => {
  it("lands on the sign-in page that brings the User back to setup", async () => {
    vi.spyOn(api, "refresh").mockResolvedValue(alice);
    vi.spyOn(api, "logout").mockResolvedValue();
    vi.spyOn(api, "twoStep").mockResolvedValue(OFF);
    vi.spyOn(api, "startTwoStepSetup").mockRejectedValue(
      new ApiError(403, "Sign in again to do this", {}, null, "reauth_required"),
    );
    render(
      <NimbusThemeProvider>
        <MemoryRouter initialEntries={["/settings/security"]}>
          <QueryClientProvider client={createQueryClient()}>
            <SessionProvider>
              <AppRoutes />
              <Where />
            </SessionProvider>
          </QueryClientProvider>
        </MemoryRouter>
      </NimbusThemeProvider>,
    );

    fireEvent.click(await within(await card()).findByRole("button", { name: "Set up" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign in again" }));

    await waitFor(() =>
      expect(screen.getByLabelText("location").textContent).toBe(
        "/login?returnTo=%2Fsettings%2Fsecurity%3Fsetup%3Dtwo-step",
      ),
    );
  });
});

describe("when the QR code can't be drawn", () => {
  it("says so and points to the key", async () => {
    vi.spyOn(api, "twoStep").mockResolvedValue(OFF);
    vi.spyOn(QRCode, "toString").mockImplementation((() =>
      Promise.reject(new Error("too long"))) as unknown as typeof QRCode.toString);
    show();

    const dialog = await openSetup();

    await within(dialog).findByText("Couldn’t draw the QR code. Enter the key instead.");
    expect(within(dialog).getByText("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP")).toBeTruthy();
  });
});
