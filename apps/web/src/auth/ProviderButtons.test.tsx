// @vitest-environment jsdom
import { ApiError } from "@repo/api";
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import type { BrowserSignInResult, NimbusDesktop } from "../shell/desktop";
import { ProviderButtons } from "./ProviderButtons";
import { goTo } from "./redirect";

vi.mock("./redirect", () => ({ goTo: vi.fn() }));

let restoreMatchMedia: () => void;
// The browser would leave the page on a click; jsdom can't, and the test only needs the page's own response.
const stayOnPage = (event: Event) => event.preventDefault();

beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
  document.addEventListener("click", stayOnPage);
  vi.spyOn(api, "providers").mockResolvedValue(["google", "github"]);
});
afterEach(() => {
  document.removeEventListener("click", stayOnPage);
  cleanup();
  vi.restoreAllMocks();
  restoreMatchMedia();
});

function Where() {
  const location = useLocation();
  return <span aria-label="location">{location.pathname + location.search}</span>;
}

function show(path = "/login") {
  render(
    <NimbusThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={createQueryClient()}>
          <ProviderButtons />
          <Where />
        </QueryClientProvider>
      </MemoryRouter>
    </NimbusThemeProvider>,
  );
}

const link = (name: string) => screen.getByRole("link", { name: `Continue with ${name}` });
/** What the screen reader is told: a region that is always there, so changes to it are announced. */
const announced = () => screen.getByRole("status").textContent;

describe("continuing with a provider", () => {
  it("says it is taking the User there, until the browser leaves", async () => {
    show();
    await screen.findByRole("link", { name: "Continue with GitHub" });
    expect(announced()).toBe("");

    fireEvent.click(link("GitHub"));

    expect(announced()).toBe("Taking you to GitHub");
    expect(document.body.textContent).toContain("Taking you to GitHub…");
    // Still a real link to the provider, so the browser can follow it after this re-render.
    expect(link("GitHub").getAttribute("href")).toBe("/api/auth/oauth2/github");
  });

  it("refuses a click on the other provider meanwhile, so it can't cancel the first", async () => {
    show();
    await screen.findByRole("link", { name: "Continue with GitHub" });
    fireEvent.click(link("GitHub"));

    // fireEvent returns false when the click's default action (following the link) was cancelled.
    const followed = fireEvent.click(link("Google"));

    expect(followed).toBe(false);
    expect(announced()).toBe("Taking you to GitHub");
  });

  it("stays put for a click that opens the provider in a new tab", async () => {
    show();
    await screen.findByRole("link", { name: "Continue with GitHub" });

    fireEvent.click(link("GitHub"), { ctrlKey: true });

    expect(announced()).toBe("");
  });

  it("starts again if the User comes back with the browser's Back button", async () => {
    show();
    await screen.findByRole("link", { name: "Continue with GitHub" });
    fireEvent.click(link("GitHub"));

    // The browser restores the page as it was left; the pageshow event says so.
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));

    expect(announced()).toBe("");
  });

  it("starts again if the browser never leaves (the User pressed Stop, or it stalled)", async () => {
    show();
    await screen.findByRole("link", { name: "Continue with GitHub" });
    vi.useFakeTimers();

    fireEvent.click(link("GitHub"));
    expect(announced()).toBe("Taking you to GitHub");
    act(() => vi.advanceTimersByTime(10_000));

    expect(announced()).toBe("");
    vi.useRealTimers();
  });
});

describe("continuing with a provider in the Desktop app", () => {
  let settle: (result: BrowserSignInResult) => void;
  let bridge: Required<NimbusDesktop>;

  beforeEach(() => {
    bridge = {
      platform: "win32",
      setTheme: vi.fn(),
      showAppMenu: vi.fn(),
      signInWithProvider: vi.fn(
        () =>
          new Promise<BrowserSignInResult>((resolve) => {
            settle = resolve;
          }),
      ),
      reopenProviderSignIn: vi.fn(),
      cancelProviderSignIn: vi.fn(() => settle({ outcome: "cancelled" })),
    };
    window.nimbusDesktop = bridge;
  });
  afterEach(() => {
    delete window.nimbusDesktop;
  });

  const location = () => screen.getByLabelText("location").textContent;

  async function startGithub(path = "/login?returnTo=%2Fprojects") {
    show(path);
    await screen.findByRole("link", { name: "Continue with GitHub" });
    const followed = fireEvent.click(link("GitHub"));
    // The window never follows the link to the provider: the browser opens it.
    expect(followed).toBe(false);
    return screen.findByRole("dialog");
  }

  it("opens the provider in the browser and waits, with Cancel and Open the browser again", async () => {
    const dialog = await startGithub();

    expect(bridge.signInWithProvider).toHaveBeenCalledWith({
      provider: "github",
      linkTicket: null,
    });
    expect(within(dialog).getByText("Finish signing in in your browser")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Open the browser again" }));
    expect(bridge.reopenProviderSignIn).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(location()).toBe("/login?returnTo=%2Fprojects");
    expect(goTo).not.toHaveBeenCalled();
  });

  it("trades the code in, then loads the callback with the page to return to", async () => {
    const exchange = vi.spyOn(api, "desktopExchange").mockResolvedValue({ twoStepRequired: false });
    await startGithub();

    act(() => settle({ outcome: "code", code: "c-1", verifier: "v-1" }));

    await waitFor(() => expect(goTo).toHaveBeenCalledWith("/auth/callback?returnTo=%2Fprojects"));
    expect(exchange).toHaveBeenCalledWith("c-1", "v-1");
  });

  it("asks for the Sign-in code in the window when Two-step verification is on", async () => {
    vi.spyOn(api, "desktopExchange").mockResolvedValue({ twoStepRequired: true });
    await startGithub();

    act(() => settle({ outcome: "code", code: "c-2", verifier: "v-2" }));

    await waitFor(() => expect(location()).toBe("/login/two-step?returnTo=%2Fprojects"));
    expect(goTo).not.toHaveBeenCalled();
  });

  it("shows the sign-in page's error when the provider said no", async () => {
    await startGithub();

    act(() => settle({ outcome: "error", error: "cancelled", provider: "github" }));

    await waitFor(() =>
      expect(location()).toBe("/login?error=cancelled&provider=github&returnTo=%2Fprojects"),
    );
  });

  it("shows the sign-in page's error when the code is refused", async () => {
    vi.spyOn(api, "desktopExchange").mockRejectedValue(
      new ApiError(400, "Signing in didn't finish", {}, null, "email_unverified"),
    );
    await startGithub("/register");

    act(() => settle({ outcome: "code", code: "c-3", verifier: "v-3" }));

    await waitFor(() => expect(location()).toBe("/login?error=email_unverified&provider=github"));
    expect(goTo).not.toHaveBeenCalled();
  });

  it("gives the sign-in up when the page goes away while it waits", async () => {
    await startGithub();

    cleanup();

    expect(bridge.cancelProviderSignIn).toHaveBeenCalledTimes(1);
  });
});
