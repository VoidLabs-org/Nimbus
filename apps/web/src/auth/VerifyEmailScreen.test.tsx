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
  passwordChangedAt: null,
  hasUploadedPicture: false,
  pictureSource: "initials",
  pictureOptions: { uploadedAt: null, uploadedUrl: null, providers: [] },
};
const verified: User = { ...unverified, emailVerified: true };

let restoreMatchMedia: () => void;
beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
});
afterEach(() => {
  vi.useRealTimers();
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

/** Lets {@code seconds} pass one second at a time, so each tick renders before the next is due. */
async function wait(seconds: number) {
  for (let i = 0; i < seconds; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
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

    await screen.findByRole("heading", { name: "Verify your email" });
    expect(document.body.textContent).toContain("alice@example.com");
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
    expect(screen.queryByText("The app")).toBeNull();
  });

  it("opens the app, at the same address, once the right code is entered", async () => {
    vi.spyOn(api, "refresh").mockResolvedValue(unverified);
    const check = vi.spyOn(api, "verifyEmail").mockResolvedValue(verified);
    show();
    await screen.findByRole("heading", { name: "Verify your email" });

    paste("123456");

    await screen.findByRole("heading", { name: "Email verified" });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("The app");
    expect(check).toHaveBeenCalledWith("123456");
  });

  it("shows the email as verified for a moment, then opens the app by itself", async () => {
    vi.spyOn(api, "refresh").mockResolvedValue(unverified);
    vi.spyOn(api, "verifyEmail").mockResolvedValue(verified);
    show();
    await screen.findByRole("heading", { name: "Verify your email" });
    vi.useFakeTimers({ shouldAdvanceTime: true });

    paste("123456");

    await screen.findByRole("heading", { name: "Email verified" });
    expect(document.body.textContent).toContain("alice@example.com is confirmed");
    expect(screen.queryByText("The app")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(screen.getByText("The app")).toBeTruthy();
  });

  it("says how many tries are left after a wrong code, and clears the boxes", async () => {
    vi.spyOn(api, "refresh").mockResolvedValue(unverified);
    vi.spyOn(api, "verifyEmail").mockRejectedValue(
      new ApiError(400, "That code is wrong", {}, null, "invalid_code", 4),
    );
    show();
    await screen.findByRole("heading", { name: "Verify your email" });

    paste("000000");

    expect((await screen.findByRole("alert")).textContent).toContain(
      "That code isn’t right. 4 tries left.",
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
    await screen.findByRole("heading", { name: "Verify your email" });

    paste("111111");

    expect((await screen.findByRole("alert")).textContent).toContain("expired");
  });

  it("lets the User sign out to start again with the right email", async () => {
    vi.spyOn(api, "refresh").mockResolvedValue(unverified);
    const logout = vi.spyOn(api, "logout").mockResolvedValue(undefined);
    show();
    await screen.findByRole("heading", { name: "Verify your email" });

    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));

    await waitFor(() => expect(logout).toHaveBeenCalled());
  });

  describe("Resend", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("mails a new code and counts down 60 seconds before it works again", async () => {
      vi.spyOn(api, "refresh").mockResolvedValue(unverified);
      const resend = vi.spyOn(api, "resendVerificationCode").mockResolvedValue(undefined);
      show();
      await screen.findByRole("heading", { name: "Verify your email" });
      vi.useFakeTimers({ shouldAdvanceTime: true });

      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

      await screen.findByRole("button", { name: "Resend code in 1:00" });
      expect(resend).toHaveBeenCalledTimes(1);
      // Pressing it again while it counts down does nothing.
      fireEvent.click(screen.getByRole("button", { name: "Resend code in 1:00" }));
      expect(resend).toHaveBeenCalledTimes(1);
      await wait(20);
      expect(screen.getByRole("button", { name: "Resend code in 0:40" })).toBeTruthy();
      await wait(40);
      expect(screen.getByRole("button", { name: "Resend code" })).toBeTruthy();
    });

    it("shows Sending… while the code is on its way, then says a new code was sent", async () => {
      vi.spyOn(api, "refresh").mockResolvedValue(unverified);
      let finish = () => {};
      vi.spyOn(api, "resendVerificationCode").mockReturnValue(
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
      show();
      await screen.findByRole("heading", { name: "Verify your email" });

      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

      await screen.findByRole("button", { name: /Sending/ });
      expect(screen.getByRole("status").textContent).toBe("");
      await act(async () => finish());
      expect((await screen.findByRole("status")).textContent).toContain("New code sent");
    });

    it("counts down from the server's Retry-After when sending is limited", async () => {
      vi.spyOn(api, "refresh").mockResolvedValue(unverified);
      vi.spyOn(api, "resendVerificationCode").mockRejectedValue(
        new ApiError(429, "Too many emails", {}, 42),
      );
      show();
      await screen.findByRole("heading", { name: "Verify your email" });

      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

      await screen.findByRole("button", { name: "Resend code in 0:42" });
    });

    it("clears a wrong or expired code message once a new code is sent", async () => {
      vi.spyOn(api, "refresh").mockResolvedValue(unverified);
      vi.spyOn(api, "verifyEmail").mockRejectedValue(
        new ApiError(400, "That code has expired", {}, null, "code_expired"),
      );
      vi.spyOn(api, "resendVerificationCode").mockResolvedValue(undefined);
      show();
      await screen.findByRole("heading", { name: "Verify your email" });
      paste("111111");
      await screen.findByRole("alert");

      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    });

    it("opens the app when the email turns out to be verified already", async () => {
      const refresh = vi.spyOn(api, "refresh").mockResolvedValue(unverified);
      vi.spyOn(api, "resendVerificationCode").mockRejectedValue(
        new ApiError(409, "This email is already verified"),
      );
      show();
      await screen.findByRole("heading", { name: "Verify your email" });
      refresh.mockResolvedValue(verified);

      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

      await screen.findByText("The app");
    });

    it("drops a wrong-code message when sending is limited", async () => {
      vi.spyOn(api, "refresh").mockResolvedValue(unverified);
      vi.spyOn(api, "verifyEmail").mockRejectedValue(
        new ApiError(400, "That code is wrong", {}, null, "invalid_code", 4),
      );
      vi.spyOn(api, "resendVerificationCode").mockRejectedValue(
        new ApiError(429, "Too many emails", {}, 30),
      );
      show();
      await screen.findByRole("heading", { name: "Verify your email" });
      paste("000000");
      await screen.findByRole("alert");

      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

      await screen.findByRole("button", { name: "Resend code in 0:30" });
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("says so when the code couldn't be sent", async () => {
      vi.spyOn(api, "refresh").mockResolvedValue(unverified);
      vi.spyOn(api, "resendVerificationCode").mockRejectedValue(new ApiError(500, "Boom"));
      show();
      await screen.findByRole("heading", { name: "Verify your email" });

      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

      expect((await screen.findByRole("alert")).textContent).toContain("Something went wrong");
      expect(
        (screen.getByRole("button", { name: "Resend code" }) as HTMLButtonElement).disabled,
      ).toBe(false);
    });
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

    await screen.findByRole("heading", { name: "Verify your email" });
  });
});
