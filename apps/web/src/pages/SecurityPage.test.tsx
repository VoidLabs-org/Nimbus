// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { toast } from "@repo/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, type SessionInfo, type User } from "../api/client";
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
};

const unused = () => Promise.resolve();

/** A session that has finished loading: Alice signed in. */
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
    confirmingEmail: false,
    finishVerifying: () => {},
    logout: unused,
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

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A session started and last used the given time ago. */
function sessionInfo(
  id: string,
  device: string,
  current: boolean,
  startedAgo: number,
  activeAgo: number,
): SessionInfo {
  return {
    id,
    device,
    current,
    startedAt: new Date(Date.now() - startedAgo).toISOString(),
    idleSeconds: Math.round(activeAgo / 1000),
  };
}

/** The rows of the card "Where you’re signed in". */
async function rowsOfCard() {
  const card = await screen.findByRole("region", { name: "Where you’re signed in" });
  return within(card).getAllByRole("listitem");
}

function show(path = "/settings/security") {
  render(
    <NimbusThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={createQueryClient()}>
          <SessionContext value={session(alice)}>
            <AppRoutes />
          </SessionContext>
        </QueryClientProvider>
      </MemoryRouter>
    </NimbusThemeProvider>,
  );
}

describe("the Security page", () => {
  it("lists where the User is signed in, this device first and marked", async () => {
    vi.spyOn(api, "sessions").mockResolvedValue([
      sessionInfo("s1", "Chrome on Windows", true, 2 * DAY, 0),
      sessionInfo("s2", "Safari on iOS", false, 9 * DAY, 2 * HOUR),
      sessionInfo("s3", "Unknown browser", false, 40 * DAY, 3 * DAY),
    ]);

    show();

    await screen.findByRole("heading", { name: "Security" });
    const rows = await rowsOfCard();
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("Chrome on Windows")).toBeTruthy();
    expect(within(rows[0]!).getByText("This device")).toBeTruthy();
    expect(rows[0]!.textContent).toContain("Active now");
    expect(within(rows[1]!).getByText("Safari on iOS")).toBeTruthy();
    expect(rows[1]!.textContent).toContain("Active 2 hours ago");
    expect(rows[1]!.textContent).toContain("Signed in");
    expect(within(rows[1]!).queryByText("This device")).toBeNull();
    expect(rows[2]!.textContent).toContain("Unknown browser");
    expect(rows[2]!.textContent).toContain("Active 3 days ago");
    expect(screen.getAllByText("This device")).toHaveLength(1);
  });

  it("says so when this is the only place the User is signed in", async () => {
    vi.spyOn(api, "sessions").mockResolvedValue([
      sessionInfo("s1", "Firefox on Linux", true, DAY, 0),
    ]);

    show();

    await screen.findByText("You’re not signed in anywhere else.");
    expect(await rowsOfCard()).toHaveLength(1);
  });

  it("does not claim the User is alone when the list comes back empty", async () => {
    vi.spyOn(api, "sessions").mockResolvedValue([]);

    show();

    await screen.findByRole("region", { name: "Where you’re signed in" });
    expect(screen.queryByText("You’re not signed in anywhere else.")).toBeNull();
  });

  it("does not claim the User is alone while the list is still loading", async () => {
    vi.spyOn(api, "sessions").mockReturnValue(new Promise(() => {}));

    show();

    await screen.findByRole("heading", { name: "Security" });
    expect(screen.queryByText("You’re not signed in anywhere else.")).toBeNull();
  });

  it("offers Try again when the list can't be loaded, and loads it then", async () => {
    const sessions = vi
      .spyOn(api, "sessions")
      .mockRejectedValueOnce(new ApiError(500, undefined))
      .mockResolvedValue([sessionInfo("s1", "Chrome on Windows", true, DAY, 0)]);

    show();

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await screen.findByText("Chrome on Windows");
    expect(sessions).toHaveBeenCalledTimes(2);
  });

  it("is listed on the Settings overview after Password", async () => {
    show("/settings");

    const links = (await screen.findAllByRole("link")).map((link) => link.getAttribute("href"));

    expect(links).toContain("/settings/security");
    expect(links.indexOf("/settings/security")).toBeGreaterThan(
      links.indexOf("/settings/password"),
    );
  });
});

describe("signing out one device", () => {
  const list = () => [
    sessionInfo("s1", "Chrome on Windows", true, 2 * DAY, 0),
    sessionInfo("s2", "Safari on iOS", false, 9 * DAY, 2 * HOUR),
  ];

  it("offers Sign out on every row except This device", async () => {
    vi.spyOn(api, "sessions").mockResolvedValue(list());

    show();

    await screen.findByText("Safari on iOS");
    const rows = await rowsOfCard();
    expect(within(rows[0]!).queryByRole("button", { name: /Sign out/ })).toBeNull();
    expect(
      within(rows[1]!).getByRole("button", { name: /^Sign out Safari on iOS \(signed in .+\)$/ }),
    ).toBeTruthy();
  });

  it("tells two browsers with the same label apart by when they were signed in", async () => {
    vi.spyOn(api, "sessions").mockResolvedValue([
      sessionInfo("s1", "Chrome on Windows", true, 2 * DAY, 0),
      sessionInfo("s2", "Chrome on Windows", false, 9 * DAY, 2 * HOUR),
      sessionInfo("s3", "Chrome on Windows", false, 40 * DAY, 3 * DAY),
    ]);

    show();

    const buttons = await screen.findAllByRole("button", { name: /^Sign out Chrome on Windows/ });
    expect(new Set(buttons.map((button) => button.getAttribute("aria-label"))).size).toBe(2);
  });

  it("signs the row out, reloads the list and confirms with a toast", async () => {
    const sessions = vi
      .spyOn(api, "sessions")
      .mockResolvedValueOnce(list())
      .mockResolvedValue([list()[0]!]);
    const endSession = vi.spyOn(api, "endSession").mockResolvedValue(undefined);
    const success = vi.spyOn(toast, "success");

    show();
    fireEvent.click(
      await screen.findByRole("button", { name: /^Sign out Safari on iOS \(signed in .+\)$/ }),
    );

    await waitFor(() => expect(screen.queryByText("Safari on iOS")).toBeNull());
    expect(endSession).toHaveBeenCalledWith("s2");
    expect(sessions).toHaveBeenCalledTimes(2);
    expect(success).toHaveBeenCalledWith(
      expect.stringMatching(/^Signed out Safari on iOS \(signed in .+\)\.$/),
    );
  });

  it("just reloads the list when that session had already ended", async () => {
    const sessions = vi
      .spyOn(api, "sessions")
      .mockResolvedValueOnce(list())
      .mockResolvedValue([list()[0]!]);
    vi.spyOn(api, "endSession").mockRejectedValue(new ApiError(404, undefined));
    const error = vi.spyOn(toast, "error");
    const info = vi.spyOn(toast, "info");

    show();
    fireEvent.click(
      await screen.findByRole("button", { name: /^Sign out Safari on iOS \(signed in .+\)$/ }),
    );

    await waitFor(() => expect(screen.queryByText("Safari on iOS")).toBeNull());
    expect(sessions).toHaveBeenCalledTimes(2);
    expect(error).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(
      expect.stringMatching(/^Safari on iOS \(signed in .+\) was already signed out\.$/),
    );
  });

  it("says so, and keeps the row, when signing out fails", async () => {
    vi.spyOn(api, "sessions").mockResolvedValue(list());
    vi.spyOn(api, "endSession").mockRejectedValue(new ApiError(500, undefined));
    const error = vi.spyOn(toast, "error");

    show();
    fireEvent.click(
      await screen.findByRole("button", { name: /^Sign out Safari on iOS \(signed in .+\)$/ }),
    );

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(screen.getByText("Safari on iOS")).toBeTruthy();
  });
});
