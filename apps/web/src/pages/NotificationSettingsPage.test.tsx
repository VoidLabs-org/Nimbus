// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { toast } from "@repo/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, type NotificationSetting, type User } from "../api/client";
import { createQueryClient } from "../api/queryClient";
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

const DEFAULTS: NotificationSetting[] = [
  { type: "ISSUE_ASSIGNED", email: true },
  { type: "ISSUE_UNASSIGNED", email: true },
  { type: "ISSUE_STATUS_CHANGED", email: true },
  { type: "ISSUE_EDITED", email: false },
  { type: "ISSUE_DELETED", email: true },
];

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreMatchMedia();
});

function Where() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname}</output>;
}

function show(path = "/settings/notifications") {
  render(
    <NimbusThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={createQueryClient()}>
          <SessionContext value={session}>
            <AppRoutes />
            <Where />
          </SessionContext>
        </QueryClientProvider>
      </MemoryRouter>
    </NimbusThemeProvider>,
  );
}

const emailSwitch = (name: string) => screen.findByRole("switch", { name: `Email: ${name}` });

describe("the Notifications settings page", () => {
  it("opens from the Settings overview", async () => {
    vi.spyOn(api, "notificationSettings").mockResolvedValue(DEFAULTS);
    show("/settings");

    fireEvent.click(await screen.findByRole("link", { name: /Notifications/ }));

    expect(await screen.findByRole("heading", { level: 1, name: "Notifications" })).toBeTruthy();
    expect(screen.getByLabelText("location").textContent).toBe("/settings/notifications");
  });

  it("shows each Issue type with its email switch and a locked in-app column", async () => {
    vi.spyOn(api, "notificationSettings").mockResolvedValue(DEFAULTS);
    show();

    const edited = await emailSwitch("Edited");
    expect((edited as HTMLInputElement).checked).toBe(false);
    expect(((await emailSwitch("Assigned to you")) as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByRole("switch")).toHaveLength(5);
    expect(screen.getAllByText("Always on")).toHaveLength(5);
    expect(screen.getByText("Sent right away.")).toBeTruthy();
    expect(screen.getByText("Several changes in one save count once.")).toBeTruthy();
    expect(screen.queryByText(/leave a project/)).toBeNull();
  });

  it("lists Security alerts as always on, in app and email", async () => {
    vi.spyOn(api, "notificationSettings").mockResolvedValue(DEFAULTS);
    show();

    const block = await screen.findByRole("region", { name: "Security alerts" });
    expect(within(block).getByText("Always on, in app and email")).toBeTruthy();
    expect(within(block).queryByRole("switch")).toBeNull();
  });

  it("saves a switch as soon as it changes, showing the new value at once", async () => {
    vi.spyOn(api, "notificationSettings").mockResolvedValue(DEFAULTS);
    let finish: () => void = () => {};
    const save = vi.spyOn(api, "saveNotificationSetting").mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    show();

    fireEvent.click(await emailSwitch("Edited"));

    expect(((await emailSwitch("Edited")) as HTMLInputElement).checked).toBe(true);
    expect(save).toHaveBeenCalledWith("ISSUE_EDITED", true);
    finish();
  });

  it("rolls the switch back and says so when saving fails", async () => {
    vi.spyOn(api, "notificationSettings").mockResolvedValue(DEFAULTS);
    vi.spyOn(api, "saveNotificationSetting").mockRejectedValue(new ApiError(500, "boom"));
    const error = vi.spyOn(toast, "error");
    show();

    fireEvent.click(await emailSwitch("Assigned to you"));

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(((await emailSwitch("Assigned to you")) as HTMLInputElement).checked).toBe(true);
  });

  it("offers to try again when the switches can't be loaded", async () => {
    const load = vi
      .spyOn(api, "notificationSettings")
      .mockRejectedValueOnce(new ApiError(500, "boom"))
      .mockResolvedValue(DEFAULTS);
    show();

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await emailSwitch("Edited");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
