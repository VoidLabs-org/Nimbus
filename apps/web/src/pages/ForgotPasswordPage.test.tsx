// @vitest-environment jsdom
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import { stubMatchMedia } from "@repo/ui/test-support";
import { toast } from "@repo/ui/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, type User } from "../api/client";
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

/** A session that has finished loading: Alice signed in, or nobody. */
function session(user: User | null): Session {
  return {
    user,
    restoring: false,
    unavailable: null,
    signedOutOnPurpose: false,
    returnAfterSignOut: null,
    retry: () => {},
    register: unused,
    login: () => Promise.resolve("signed-in"),
    signInWithCode: unused,
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
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
  restoreMatchMedia();
});

/** The app at an address, as a visitor (or Alice) opening it. */
function show(path = "/forgot-password", user: User | null = null) {
  render(
    <NimbusThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={createQueryClient()}>
          <SessionContext value={session(user)}>
            <AppRoutes />
          </SessionContext>
        </QueryClientProvider>
      </MemoryRouter>
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

function codeBoxes(): string[] {
  return screen.getAllByRole("textbox").map((box) => (box as HTMLInputElement).value);
}

/** Step 1 done: the email typed and the code asked for, so the page shows step 2. */
async function reachStepTwo(email = "alice@example.com") {
  show();
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /Send code/ }));
  await screen.findByRole("heading", { name: "Check your email" });
}

function typePassword(value: string) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value } });
}

describe("the sign-in page", () => {
  it("links to the forgot-password page next to the password field", async () => {
    show("/login");

    const link = await screen.findByRole("link", { name: "Forgot password?" });

    expect(link.getAttribute("href")).toBe("/forgot-password");
  });
});

describe("the sign-in page label", () => {
  it("keeps the link out of the password field's label", async () => {
    show("/login");

    const input = await screen.findByLabelText("Password");
    const link = screen.getByRole("link", { name: "Forgot password?" });

    expect(input.getAttribute("autocomplete")).toBe("current-password");
    expect(link.closest("label")).toBeNull();
  });
});

describe("the forgot-password page, step 1", () => {
  it("asks for the email, and offers the way back to sign in", async () => {
    show();

    await screen.findByRole("heading", { name: "Forgot your password?" });
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to sign in" }).getAttribute("href")).toBe(
      "/login",
    );
  });

  it("asks for a code and moves to step 2, naming the address it went to", async () => {
    const request = vi.spyOn(api, "requestPasswordReset").mockResolvedValue(undefined);

    await reachStepTwo("  Alice@Example.com ");

    expect(request).toHaveBeenCalledWith("Alice@Example.com");
    expect(document.body.textContent).toContain("If Alice@Example.com is registered");
    expect(document.body.textContent).toContain("we sent a 6-digit code");
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByText("8 to 128 characters")).toBeTruthy();
  });

  it("does not ask for a code without an email", async () => {
    const request = vi.spyOn(api, "requestPasswordReset").mockResolvedValue(undefined);
    show();
    await screen.findByRole("heading", { name: "Forgot your password?" });

    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));

    await screen.findByText("Enter your email");
    expect(request).not.toHaveBeenCalled();
  });

  it("says when there have been too many requests, under the button", async () => {
    vi.spyOn(api, "requestPasswordReset").mockRejectedValue(new ApiError(429, "Too many", {}, 120));
    show();
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "alice@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));

    await screen.findByText("Too many attempts. Try again in 2:00.");
    expect(screen.queryByRole("heading", { name: "Check your email" })).toBeNull();
  });

  it("stays on step 1 with a message when the request fails", async () => {
    vi.spyOn(api, "requestPasswordReset").mockRejectedValue(new Error("offline"));
    show();
    fireEvent.change(await screen.findByLabelText("Email"), {
      target: { value: "alice@example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));

    await screen.findByText("Something went wrong. Please try again.");
  });

  it("sends a signed-in User into the app", async () => {
    show("/forgot-password", alice);

    await waitFor(() => expect(screen.queryByRole("heading", { name: /password/ })).toBeNull());
    expect(screen.queryByLabelText("Email")).toBeNull();
  });
});

describe("the forgot-password page, step 1 limits", () => {
  it("waits out a rate limit, and stops saying Enter your email once one is typed", async () => {
    vi.spyOn(api, "requestPasswordReset").mockRejectedValue(new ApiError(429, "Too many", {}, 60));
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Send code/ }));
    await screen.findByText("Enter your email");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alice@example.com" } });
    expect(screen.queryByText("Enter your email")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));

    const waiting = (await screen.findByRole("button", {
      name: /Send code in 1:00/,
    })) as HTMLButtonElement;
    expect(waiting.disabled).toBe(true);
    expect(api.requestPasswordReset).toHaveBeenCalledTimes(1);
  });

  it("counts the wait for one address only, so a different address can be sent to at once", async () => {
    const request = vi.spyOn(api, "requestPasswordReset").mockResolvedValue(undefined);
    await reachStepTwo("alice@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    await screen.findByRole("heading", { name: "Forgot your password?" });

    // The same address is still waiting out its minute.
    expect(
      (screen.getByRole("button", { name: /Send code in 1:00/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "bob@example.com" } });
    expect(
      (screen.getByRole("button", { name: /^Send code$/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Send code/ }));

    await screen.findByRole("heading", { name: "Check your email" });
    expect(request).toHaveBeenLastCalledWith("bob@example.com");
  });
});

describe("the forgot-password page, step 2", () => {
  beforeEach(() => {
    vi.spyOn(api, "requestPasswordReset").mockResolvedValue(undefined);
  });

  it("fills the six boxes from a pasted code, digits only", async () => {
    await reachStepTwo();

    paste("123456");

    expect(codeBoxes()).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("ignores letters typed into a box", async () => {
    await reachStepTwo();
    const [first] = screen.getAllByRole("textbox");

    fireEvent.change(first!, { target: { value: "a" } });
    fireEvent.change(first!, { target: { value: "7" } });

    expect(codeBoxes()[0]).toBe("7");
  });

  it("goes back to step 1 with the email kept when the User wants a different one", async () => {
    await reachStepTwo();

    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));

    await screen.findByRole("heading", { name: "Forgot your password?" });
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("alice@example.com");
  });
});

describe("the forgot-password page, resetting", () => {
  beforeEach(() => {
    vi.spyOn(api, "requestPasswordReset").mockResolvedValue(undefined);
  });

  it("sets the new password with the code, then opens sign-in with the email kept and the password focused", async () => {
    const reset = vi.spyOn(api, "resetPassword").mockResolvedValue(undefined);
    const success = vi.spyOn(toast, "success");
    await reachStepTwo();

    paste("123456");
    typePassword("a new password");
    fireEvent.click(screen.getByRole("button", { name: /Reset password/ }));

    await screen.findByRole("heading", { name: "Welcome back" });
    expect(reset).toHaveBeenCalledWith({
      email: "alice@example.com",
      code: "123456",
      newPassword: "a new password",
    });
    expect(success).toHaveBeenCalledWith("Password updated. You were signed out on other devices.");
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("alice@example.com");
    expect(document.activeElement).toBe(
      document.querySelector('input[autocomplete="current-password"]'),
    );
  });

  it("keeps Reset password off until all six digits are in", async () => {
    await reachStepTwo();
    const button = () =>
      screen.getByRole("button", { name: /Reset password/ }) as HTMLButtonElement;

    expect(button().disabled).toBe(true);
    paste("123456");
    expect(button().disabled).toBe(false);
  });

  it("keeps the boxes filled and red, and says how many tries are left, for a wrong code", async () => {
    vi.spyOn(api, "resetPassword").mockRejectedValue(
      new ApiError(400, "That code is wrong", {}, null, "invalid_code", 3),
    );
    await reachStepTwo();

    paste("123456");
    typePassword("a new password");
    fireEvent.click(screen.getByRole("button", { name: /Reset password/ }));

    await screen.findByText("That code isn’t right. 3 tries left.");
    expect(codeBoxes()).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(screen.getAllByRole("textbox")[0]!.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("New password")).toBeTruthy();
  });

  it("drops the red boxes and the message as soon as the User changes the code", async () => {
    vi.spyOn(api, "resetPassword").mockRejectedValue(
      new ApiError(400, "That code is wrong", {}, null, "invalid_code", 3),
    );
    await reachStepTwo();
    paste("123456");
    typePassword("a new password");
    fireEvent.click(screen.getByRole("button", { name: /Reset password/ }));
    await screen.findByText("That code isn’t right. 3 tries left.");

    fireEvent.change(screen.getAllByRole("textbox")[5]!, { target: { value: "9" } });

    expect(screen.queryByText("That code isn’t right. 3 tries left.")).toBeNull();
    expect(screen.getAllByRole("textbox")[0]!.getAttribute("aria-invalid")).not.toBe("true");
  });

  it("says 1 try, not 1 tries", async () => {
    vi.spyOn(api, "resetPassword").mockRejectedValue(
      new ApiError(400, "That code is wrong", {}, null, "invalid_code", 1),
    );
    await reachStepTwo();

    paste("123456");
    typePassword("a new password");
    fireEvent.click(screen.getByRole("button", { name: /Reset password/ }));

    await screen.findByText("That code isn’t right. 1 try left.");
  });

  it("offers a new code in place of the password field when the code has expired", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const reset = vi
      .spyOn(api, "resetPassword")
      .mockRejectedValue(new ApiError(400, "That code has expired", {}, null, "code_expired"));
    await reachStepTwo();
    paste("123456");
    typePassword("a new password");
    fireEvent.click(screen.getByRole("button", { name: /Reset password/ }));

    await screen.findByText("This code has expired.");

    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(screen.queryByRole("button", { name: /Reset password/ })).toBeNull();
    // Pressing Enter in the boxes does not send the dead code again.
    fireEvent.submit(document.querySelector("form")!);
    expect(reset).toHaveBeenCalledTimes(1);
    // The new code waits for the same countdown as Resend, so it cannot be refused for coming too soon.
    const asking = screen.getByRole("button", { name: /Send a new code/ }) as HTMLButtonElement;
    expect(asking.disabled).toBe(true);
    expect(asking.textContent).toContain("1:00");
    await wait(60);
    fireEvent.click(screen.getByRole("button", { name: /Send a new code/ }));
    await screen.findByLabelText("New password");
    expect(api.requestPasswordReset).toHaveBeenCalledTimes(2);
    expect(codeBoxes()).toEqual(["", "", "", "", "", ""]);
    expect(screen.queryByText("This code has expired.")).toBeNull();
  });

  it("keeps the new password the User typed when a new code is sent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await reachStepTwo();
    paste("123456");
    typePassword("a new password");
    await wait(60);

    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    await screen.findByRole("button", { name: "Resend code in 1:00" });
    expect(codeBoxes()).toEqual(["", "", "", "", "", ""]);
    expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe(
      "a new password",
    );
  });

  it("shows a rejected password under the field, in place of the hint, and keeps the code", async () => {
    vi.spyOn(api, "resetPassword").mockRejectedValue(
      new ApiError(400, "Some fields are invalid", {
        newPassword: "size must be between 8 and 128",
      }),
    );
    await reachStepTwo();
    paste("123456");
    typePassword("a long enough password");

    fireEvent.click(screen.getByRole("button", { name: /Reset password/ }));

    await screen.findByText("size must be between 8 and 128");
    expect(screen.queryByText("8 to 128 characters")).toBeNull();
    expect(codeBoxes()).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("catches a too-short password before sending anything", async () => {
    const reset = vi.spyOn(api, "resetPassword").mockResolvedValue(undefined);
    await reachStepTwo();
    paste("123456");
    typePassword("short");

    fireEvent.click(screen.getByRole("button", { name: /Reset password/ }));

    await screen.findByText("Use 8 to 128 characters");
    expect(reset).not.toHaveBeenCalled();
    expect(codeBoxes()).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("says when there have been too many attempts", async () => {
    vi.spyOn(api, "resetPassword").mockRejectedValue(new ApiError(429, "Too many", {}, 60));
    await reachStepTwo();
    paste("123456");
    typePassword("a new password");

    fireEvent.click(screen.getByRole("button", { name: /Reset password/ }));

    await screen.findByText("Too many attempts. Try again in 1:00.");
    // The rate-limited layout: nothing can be typed or pressed, and Resend says it is paused.
    for (const box of screen.getAllByRole("textbox")) {
      expect((box as HTMLInputElement).disabled).toBe(true);
    }
    expect((screen.getByLabelText("New password") as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: /Reset password/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Resend paused" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Resend code/ })).toBeNull();
  });

  it("counts the rate-limited wait down, then gives the form back with the code still in it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(api, "resetPassword").mockRejectedValue(new ApiError(429, "Too many", {}, 3));
    await reachStepTwo();
    paste("123456");
    typePassword("a new password");
    fireEvent.click(screen.getByRole("button", { name: /Reset password/ }));
    await screen.findByText("Too many attempts. Try again in 0:03.");

    await wait(1);
    await screen.findByText("Too many attempts. Try again in 0:02.");
    await wait(2);

    await waitFor(() => expect(screen.queryByText(/Too many attempts/)).toBeNull());
    expect(codeBoxes()).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect((screen.getByLabelText("New password") as HTMLInputElement).disabled).toBe(false);
  });

  it("shows the rate-limited layout when Resend is refused, and Resend waits for the server's time", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await reachStepTwo();
    await wait(60);
    vi.mocked(api.requestPasswordReset).mockRejectedValue(new ApiError(429, "Too many", {}, 125));

    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    await screen.findByText("Too many attempts. Try again in 2:05.");
    expect(screen.getByRole("button", { name: "Resend paused" })).toBeTruthy();
    for (const box of screen.getAllByRole("textbox")) {
      expect((box as HTMLInputElement).disabled).toBe(true);
    }
  });

  it("stays put with a message when the reset fails for another reason", async () => {
    vi.spyOn(api, "resetPassword").mockRejectedValue(new Error("offline"));
    await reachStepTwo();
    paste("123456");
    typePassword("a new password");

    fireEvent.click(screen.getByRole("button", { name: /Reset password/ }));

    await screen.findByText("Something went wrong. Please try again.");
    expect(codeBoxes()).toEqual(["1", "2", "3", "4", "5", "6"]);
  });
});

describe("Resend on the forgot-password page", () => {
  beforeEach(() => {
    vi.spyOn(api, "requestPasswordReset").mockResolvedValue(undefined);
  });

  it("counts down 60 seconds from the first send, then asks for a new code", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await reachStepTwo();
    expect(screen.getByRole("button", { name: "Resend code in 1:00" })).toBeTruthy();

    // Pressing it while it counts down does nothing.
    fireEvent.click(screen.getByRole("button", { name: "Resend code in 1:00" }));
    expect(api.requestPasswordReset).toHaveBeenCalledTimes(1);
    await wait(18);
    expect(screen.getByRole("button", { name: "Resend code in 0:42" })).toBeTruthy();
    await wait(42);
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    await screen.findByRole("button", { name: "Resend code in 1:00" });
    expect(api.requestPasswordReset).toHaveBeenCalledTimes(2);
    expect(api.requestPasswordReset).toHaveBeenLastCalledWith("alice@example.com");
  });

  it("shows Sending… while the code is on its way, then says a new code was sent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await reachStepTwo();
    await wait(60);
    let finish = () => {};
    vi.mocked(api.requestPasswordReset).mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    await screen.findByRole("button", { name: /Sending/ });
    expect(screen.getByRole("status").textContent).toBe("");
    await act(async () => finish());
    expect((await screen.findByRole("status")).textContent).toContain("New code sent");
  });

  it("counts down from the server's Retry-After when sending is limited", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await reachStepTwo();
    await wait(60);
    vi.mocked(api.requestPasswordReset).mockRejectedValue(new ApiError(429, "Too many", {}, 42));

    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    await screen.findByText("Too many attempts. Try again in 0:42.");
    expect(screen.getByRole("button", { name: "Resend paused" })).toBeTruthy();
    await wait(42);
    await screen.findByRole("button", { name: "Resend code" });
  });
});
