// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { ProviderButtons } from "./ProviderButtons";

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

function show() {
  render(
    <NimbusThemeProvider>
      <MemoryRouter>
        <ProviderButtons />
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
