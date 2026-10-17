// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe("continuing with a provider", () => {
  it("says it is taking the User there, and holds the other provider back, until the browser leaves", async () => {
    show();

    fireEvent.click(await screen.findByRole("link", { name: "Continue with GitHub" }));

    expect(screen.getByRole("status").textContent).toContain("Taking you to GitHub");
    // Still a real link to the provider, so the browser can follow it after this re-render.
    expect(screen.getByRole("link", { name: "Continue with GitHub" }).getAttribute("href")).toBe(
      "/api/auth/oauth2/github",
    );
    expect(
      screen.getByRole("link", { name: "Continue with Google" }).hasAttribute("data-disabled"),
    ).toBe(true);
  });

  it("starts again if the User comes back with the browser's Back button", async () => {
    show();
    fireEvent.click(await screen.findByRole("link", { name: "Continue with GitHub" }));

    // The browser restores the page as it was left; the pageshow event says so.
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true }));

    expect(screen.queryByRole("status")).toBeNull();
  });
});
