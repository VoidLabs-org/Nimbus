// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, type User } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { RequireUser, SessionProvider } from "./session";

const unverified: User = {
  id: "u1",
  email: "alice@example.com",
  displayName: "Alice",
  avatarUrl: null,
  hasPassword: true,
  emailVerified: false,
};
const verified: User = { ...unverified, emailVerified: true };

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreMatchMedia();
});

/** The app's signed-in area as the server's current User sees it: the verification screen, or the page. */
function show() {
  render(
    <NimbusThemeProvider>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <SessionProvider>
            <RequireUser>
              <p>The app</p>
            </RequireUser>
          </SessionProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </NimbusThemeProvider>,
  );
}

/** Pastes a code into the first of the six boxes, as a person copying it from the email would. */
function paste(code: string) {
  const [first] = screen.getAllByRole("textbox");
  fireEvent.paste(first!, { clipboardData: { getData: () => code } });
}

describe("the verification screen", () => {
  it("replaces the app for a User who hasn't verified, naming the address the code went to", async () => {
    vi.spyOn(api, "refresh").mockResolvedValue(unverified);
    show();

    await screen.findByRole("heading", { name: "Check your email" });
    expect(document.body.textContent).toContain("alice@example.com");
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
    expect(screen.queryByText("The app")).toBeNull();
  });

  it("opens the app, at the same address, once the right code is entered", async () => {
    vi.spyOn(api, "refresh").mockResolvedValue(unverified);
    const check = vi.spyOn(api, "verifyEmail").mockResolvedValue(verified);
    show();
    await screen.findByRole("heading", { name: "Check your email" });

    paste("123456");

    await screen.findByText("The app");
    expect(check).toHaveBeenCalledWith("123456");
  });

  it("says how many tries are left after a wrong code, and clears the boxes", async () => {
    vi.spyOn(api, "refresh").mockResolvedValue(unverified);
    vi.spyOn(api, "verifyEmail").mockRejectedValue(
      new ApiError(400, "That code is wrong", {}, null, "invalid_code", 4),
    );
    show();
    await screen.findByRole("heading", { name: "Check your email" });

    paste("000000");

    expect((await screen.findByRole("alert")).textContent).toBe(
      "That code is wrong. 4 tries left.",
    );
    await waitFor(() =>
      expect(screen.getAllByRole("textbox").map((box) => (box as HTMLInputElement).value)).toEqual([
        "",
        "",
        "",
        "",
        "",
        "",
      ]),
    );
  });

  it("says when the code has expired or was cancelled", async () => {
    vi.spyOn(api, "refresh").mockResolvedValue(unverified);
    vi.spyOn(api, "verifyEmail").mockRejectedValue(
      new ApiError(400, "That code has expired", {}, null, "code_expired"),
    );
    show();
    await screen.findByRole("heading", { name: "Check your email" });

    paste("111111");

    expect((await screen.findByRole("alert")).textContent).toContain("expired");
  });

  it("lets the User sign out to start again with the right email", async () => {
    vi.spyOn(api, "refresh").mockResolvedValue(unverified);
    const logout = vi.spyOn(api, "logout").mockResolvedValue(undefined);
    show();
    await screen.findByRole("heading", { name: "Check your email" });

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(logout).toHaveBeenCalled());
  });

  it("takes over the app when the server refuses a request because the email isn't verified", async () => {
    vi.spyOn(api, "refresh").mockResolvedValue(verified);
    let refuse = () => {};
    vi.spyOn(api, "onEmailUnverified").mockImplementation((listener) => {
      refuse = listener;
      return () => {};
    });
    show();
    await screen.findByText("The app");

    act(() => refuse());

    await screen.findByRole("heading", { name: "Check your email" });
  });
});
