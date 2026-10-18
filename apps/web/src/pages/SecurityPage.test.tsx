// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { toast } from "@repo/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, type LinkedIdentity, type SessionInfo, type User } from "../api/client";
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
  // The Connected accounts card asks for these on every visit; tests about it say otherwise.
  vi.spyOn(api, "providers").mockResolvedValue([]);
  vi.spyOn(api, "linkedIdentities").mockResolvedValue([]);
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

describe("signing out all other devices", () => {
  const three = () => [
    sessionInfo("s1", "Chrome on Windows", true, 2 * DAY, 0),
    sessionInfo("s2", "Safari on iOS", false, 9 * DAY, 2 * HOUR),
    sessionInfo("s3", "Firefox on Linux", false, 40 * DAY, 3 * DAY),
  ];
  const openDialog = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Sign out all other devices" }));
    return screen.findByRole("dialog");
  };

  it("hides the button when there is no other device", async () => {
    vi.spyOn(api, "sessions").mockResolvedValue([
      sessionInfo("s1", "Chrome on Windows", true, DAY, 0),
    ]);

    show();

    await screen.findByText("You’re not signed in anywhere else.");
    expect(screen.queryByRole("button", { name: "Sign out all other devices" })).toBeNull();
  });

  it("lists the devices in the dialog, with the count in its button", async () => {
    vi.spyOn(api, "sessions").mockResolvedValue(three());

    show();
    const dialog = await openDialog();

    expect(within(dialog).getByText(/^Safari on iOS \(signed in /)).toBeTruthy();
    expect(within(dialog).getByText(/^Firefox on Linux \(signed in /)).toBeTruthy();
    expect(within(dialog).queryByText(/^Chrome on Windows/)).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Sign out 2 devices" })).toBeTruthy();
  });

  it("says 1 device for a single other device", async () => {
    vi.spyOn(api, "sessions").mockResolvedValue(three().slice(0, 2));

    show();
    const dialog = await openDialog();

    expect(within(dialog).getByRole("button", { name: "Sign out 1 device" })).toBeTruthy();
  });

  it("changes nothing on Cancel", async () => {
    vi.spyOn(api, "sessions").mockResolvedValue(three());
    const endOthers = vi.spyOn(api, "endOtherSessions").mockResolvedValue(undefined);

    show();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(endOthers).not.toHaveBeenCalled();
    expect(screen.getByText("Safari on iOS")).toBeTruthy();
  });

  it("signs the others out, leaves only this device and confirms with a toast", async () => {
    const sessions = vi
      .spyOn(api, "sessions")
      .mockResolvedValueOnce(three())
      .mockResolvedValue([three()[0]!]);
    const endOthers = vi.spyOn(api, "endOtherSessions").mockResolvedValue(undefined);
    const success = vi.spyOn(toast, "success");

    show();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign out 2 devices" }));

    await screen.findByText("You’re not signed in anywhere else.");
    expect(endOthers).toHaveBeenCalledTimes(1);
    expect(sessions).toHaveBeenCalledTimes(2);
    expect(await rowsOfCard()).toHaveLength(1);
    expect(success).toHaveBeenCalledWith("Signed out your other devices.");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says so, and keeps the dialog, when it fails", async () => {
    vi.spyOn(api, "sessions").mockResolvedValue(three());
    vi.spyOn(api, "endOtherSessions").mockRejectedValue(new ApiError(500, undefined));
    const error = vi.spyOn(toast, "error");

    show();
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign out 2 devices" }));

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("the Connected accounts card", () => {
  const identity = (
    provider: string,
    accountName: string | null,
    connectedAgo = 3 * DAY,
  ): LinkedIdentity => ({
    provider,
    accountName,
    connectedAt: new Date(Date.now() - connectedAgo).toISOString(),
  });
  const card = () => screen.findByRole("region", { name: "Connected accounts" });
  /** The card's rows once they have loaded: its heading is there from the start, over a skeleton. */
  const accountRows = async () => within(await card()).findAllByRole("listitem");
  const sessionsFor = () =>
    vi
      .spyOn(api, "sessions")
      .mockResolvedValue([sessionInfo("s1", "Chrome on Windows", true, DAY, 0)]);

  it("shows who each connected provider is, and Not connected for the others", async () => {
    sessionsFor();
    vi.spyOn(api, "providers").mockResolvedValue(["google", "github"]);
    vi.spyOn(api, "linkedIdentities").mockResolvedValue([identity("google", "udula@gmail.com")]);

    show();

    const rows = await accountRows();
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Google")).toBeTruthy();
    expect(rows[0]!.textContent).toContain("Connected as udula@gmail.com");
    expect(within(rows[1]!).getByText("GitHub")).toBeTruthy();
    expect(rows[1]!.textContent).toContain("Not connected");
  });

  it("names the GitHub username when that is what is connected", async () => {
    sessionsFor();
    vi.spyOn(api, "providers").mockResolvedValue(["google", "github"]);
    vi.spyOn(api, "linkedIdentities").mockResolvedValue([
      identity("github", "udula-t"),
      identity("google", "udula@gmail.com"),
    ]);

    show();

    const rows = await accountRows();
    // Google first whatever order the server sends them in.
    expect(rows[0]!.textContent).toContain("Connected as udula@gmail.com");
    expect(rows[1]!.textContent).toContain("Connected as udula-t");
  });

  it("says just Connected for an account linked before names were kept", async () => {
    sessionsFor();
    vi.spyOn(api, "providers").mockResolvedValue(["google"]);
    vi.spyOn(api, "linkedIdentities").mockResolvedValue([identity("google", null)]);

    show();

    const rows = await accountRows();
    expect(rows[0]!.textContent).toContain("Connected");
    expect(rows[0]!.textContent).not.toContain("Connected as");
  });

  it("lists only the providers the server has switched on", async () => {
    sessionsFor();
    vi.spyOn(api, "providers").mockResolvedValue(["github"]);

    show();

    const rows = await accountRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain("GitHub");
    expect(within(await card()).queryByText("Google")).toBeNull();
  });

  it("still lists a connected provider that has since been switched off", async () => {
    sessionsFor();
    vi.spyOn(api, "providers").mockResolvedValue(["github"]);
    vi.spyOn(api, "linkedIdentities").mockResolvedValue([identity("google", "udula@gmail.com")]);

    show();

    const rows = await accountRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("Connected as udula@gmail.com");
    expect(rows[1]!.textContent).toContain("Not connected");
  });

  it("is hidden when no provider is on and nothing is connected", async () => {
    sessionsFor();

    show();

    await screen.findByText("Chrome on Windows");
    await waitFor(() => expect(api.linkedIdentities).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Connected accounts" })).toBeNull(),
    );
  });

  it("still lists what is connected when the providers can't be asked", async () => {
    sessionsFor();
    vi.spyOn(api, "providers").mockRejectedValue(new ApiError(500, undefined));
    vi.spyOn(api, "linkedIdentities").mockResolvedValue([identity("github", "udula-t")]);

    show();

    const rows = await accountRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain("Connected as udula-t");
  });

  it("offers Try again when the connected accounts can't be loaded, and loads them then", async () => {
    sessionsFor();
    vi.spyOn(api, "providers").mockResolvedValue(["google"]);
    const identities = vi
      .spyOn(api, "linkedIdentities")
      .mockRejectedValueOnce(new ApiError(500, undefined))
      .mockResolvedValue([identity("google", "udula@gmail.com")]);

    show();

    fireEvent.click(await within(await card()).findByRole("button", { name: "Try again" }));

    await within(await card()).findByText("Connected as udula@gmail.com");
    expect(identities).toHaveBeenCalledTimes(2);
  });

  it("offers Disconnect on a connected row only, and no Connect yet", async () => {
    sessionsFor();
    vi.spyOn(api, "providers").mockResolvedValue(["google", "github"]);
    vi.spyOn(api, "linkedIdentities").mockResolvedValue([identity("google", "udula@gmail.com")]);

    show();

    await accountRows();
    expect(screen.getAllByRole("button", { name: /^Disconnect/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Disconnect Google" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Connect/ })).toBeNull();
  });

  it("does not hold up the sessions list while it loads", async () => {
    sessionsFor();
    vi.spyOn(api, "providers").mockReturnValue(new Promise(() => {}));

    show();

    expect(await screen.findByText("Chrome on Windows")).toBeTruthy();
  });
});

describe("disconnecting a provider", () => {
  const identity = (provider: string, accountName: string): LinkedIdentity => ({
    provider,
    accountName,
    connectedAt: new Date(Date.now() - 3 * DAY).toISOString(),
  });
  const both = [identity("google", "udula@gmail.com"), identity("github", "udula")];

  function setUp(identities: LinkedIdentity[], user: User = alice, after = identities) {
    vi.spyOn(api, "sessions").mockResolvedValue([
      sessionInfo("s1", "Chrome on Windows", true, DAY, 0),
    ]);
    vi.spyOn(api, "providers").mockResolvedValue(["google", "github"]);
    const linked = vi
      .spyOn(api, "linkedIdentities")
      .mockResolvedValueOnce(identities)
      .mockResolvedValue(after);
    render(
      <NimbusThemeProvider>
        <MemoryRouter initialEntries={["/settings/security"]}>
          <QueryClientProvider client={createQueryClient()}>
            <SessionContext value={session(user)}>
              <AppRoutes />
            </SessionContext>
          </QueryClientProvider>
        </MemoryRouter>
      </NimbusThemeProvider>,
    );
    return linked;
  }

  it("asks first, and Cancel changes nothing", async () => {
    const disconnect = vi.spyOn(api, "disconnectProvider").mockResolvedValue(undefined);
    setUp(both);

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Google" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Disconnect Google?")).toBeTruthy();
    expect(
      within(dialog).getByText(
        /You won.t be able to sign in with Google\. You can connect it again any time\./,
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("disconnects on confirm, reloads the list and confirms with a toast", async () => {
    const disconnect = vi.spyOn(api, "disconnectProvider").mockResolvedValue(undefined);
    const success = vi.spyOn(toast, "success");
    const linked = setUp(both, alice, [both[1]!]);

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Google" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));

    await waitFor(() => expect(screen.queryByText("Connected as udula@gmail.com")).toBeNull());
    expect(disconnect).toHaveBeenCalledWith("google");
    expect(linked).toHaveBeenCalledTimes(2);
    expect(success).toHaveBeenCalledWith("Disconnected Google.");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("asks for a password first when the provider is the only way to sign in", async () => {
    const disconnect = vi.spyOn(api, "disconnectProvider").mockResolvedValue(undefined);
    setUp([both[0]!], { ...alice, hasPassword: false });

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Google" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Set a password first")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Set a password" }).getAttribute("href")).toBe(
      "/settings/password",
    );
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("does not ask for a password when there is another way in", async () => {
    setUp(both, { ...alice, hasPassword: false });

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Google" }));

    expect(within(await screen.findByRole("dialog")).getByText("Disconnect Google?")).toBeTruthy();
  });

  it("shows the password dialog when the server refuses with last_sign_in_method", async () => {
    vi.spyOn(api, "disconnectProvider").mockRejectedValue(
      new ApiError(409, "Set a password first.", {}, null, "last_sign_in_method"),
    );
    setUp(both);

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Google" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Disconnect" }),
    );

    const dialog = await screen.findByText("Set a password first");
    expect(dialog).toBeTruthy();
    expect(screen.getByRole("link", { name: "Set a password" })).toBeTruthy();
  });

  it("says so, and keeps the dialog, when disconnecting fails", async () => {
    vi.spyOn(api, "disconnectProvider").mockRejectedValue(new ApiError(500, undefined));
    const error = vi.spyOn(toast, "error");
    setUp(both);

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect Google" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Disconnect" }),
    );

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
