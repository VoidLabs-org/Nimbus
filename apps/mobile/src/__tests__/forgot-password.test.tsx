import { fireEvent, screen } from "@testing-library/react-native";
import { ada, fakeApi, renderApp, secureStore } from "../test-support";

async function openForgotPassword() {
  secureStore.set("nimbus.welcomed", "yes");
  await renderApp();
  await fireEvent.press(await screen.findByRole("button", { name: "Forgot password?" }));
  await screen.findByText("Forgot your password?");
}

async function askForCode(email = "ada@example.com") {
  await fireEvent.changeText(screen.getByLabelText("Email"), email);
  await fireEvent.press(screen.getByRole("button", { name: "Send code" }));
  await screen.findByText("Check your email");
}

async function reset(code: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText("Reset code"), code);
  await fireEvent.changeText(screen.getByLabelText("New password"), password);
  await fireEvent.press(screen.getByRole("button", { name: "Reset password" }));
}

function wrongCode(triesLeft: number) {
  return { status: 400, body: { detail: "Wrong code", code: "invalid_code", triesLeft } };
}

it("resets the password with the emailed code, then signs in with it", async () => {
  const api = fakeApi();
  api.answer("POST /api/auth/password-reset", { status: 204 });
  api.answer("POST /api/auth/password-reset/confirm", { status: 204 });
  api.answer("POST /api/auth/login", {
    status: 200,
    body: { accessToken: "access-1", refreshToken: "refresh-1", user: ada },
  });
  api.answer("GET /api/users/me", { status: 200, body: ada });

  await openForgotPassword();
  await askForCode(" ada@example.com ");

  expect(screen.getByText("ada@example.com")).toBeTruthy();
  expect(api.to("POST /api/auth/password-reset")[0]!.body).toEqual({ email: "ada@example.com" });
  await reset("720518", "new horse battery");

  expect(
    await screen.findByText("Password updated. You were signed out on other devices."),
  ).toBeTruthy();
  expect(screen.getByText("Welcome back")).toBeTruthy();
  expect(api.to("POST /api/auth/password-reset/confirm")[0]!.body).toEqual({
    email: "ada@example.com",
    code: "720518",
    newPassword: "new horse battery",
  });
  // The email is filled in; the new password is all that's left to type.
  expect(screen.getByLabelText("Email").props.value).toBe("ada@example.com");
  await fireEvent.changeText(screen.getByLabelText("Password"), "new horse battery");
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

  expect(await screen.findByText(/Ada Lovelace/)).toBeTruthy();
});

describe("when the Reset code doesn't work", () => {
  it("says how many tries are left, keeping the new password", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/password-reset", { status: 204 });
    api.answer("POST /api/auth/password-reset/confirm", wrongCode(3));

    await openForgotPassword();
    await askForCode();
    await reset("720518", "new horse battery");

    expect(await screen.findByText("That code isn’t right. 3 tries left.")).toBeTruthy();
    expect(screen.getByLabelText("New password").props.value).toBe("new horse battery");
  });

  it("offers a new code once the code has expired", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/password-reset", { status: 204 });
    api.answer("POST /api/auth/password-reset/confirm", {
      status: 400,
      body: { detail: "Expired", code: "code_expired" },
    });

    await openForgotPassword();
    await askForCode();
    await reset("720518", "new horse battery");

    expect(await screen.findByText("This code has expired.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reset password" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send a new code in 1:00" })).toBeTruthy();
  });

  it("counts down the wait when there were too many tries", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/password-reset", { status: 204 });
    api.answer("POST /api/auth/password-reset/confirm", {
      status: 429,
      headers: { "Retry-After": "120" },
    });

    await openForgotPassword();
    await askForCode();
    await reset("720518", "new horse battery");

    expect(await screen.findByText("Too many attempts. Try again in 2:00.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset password" })).toBeDisabled();
  });

  it("checks the new password's length before sending", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/password-reset", { status: 204 });

    await openForgotPassword();
    await askForCode();
    await reset("720518", "short");

    expect(screen.getByText("Use 8 to 128 characters")).toBeTruthy();
    expect(api.to("POST /api/auth/password-reset/confirm")).toHaveLength(0);
  });

  it("sends a User with Two-step verification to the web for now", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/password-reset", { status: 204 });
    api.answer("POST /api/auth/password-reset/confirm", {
      status: 400,
      body: { detail: "Two-step", code: "two_step_required" },
    });

    await openForgotPassword();
    await askForCode();
    await reset("720518", "new horse battery");

    expect(await screen.findByText(/Reset your password on the web for now/)).toBeTruthy();
  });
});

it("says how long to wait when the address was sent codes too often", async () => {
  const api = fakeApi();
  api.answer("POST /api/auth/password-reset", { status: 429, headers: { "Retry-After": "42" } });

  await openForgotPassword();
  await fireEvent.changeText(screen.getByLabelText("Email"), "ada@example.com");
  await fireEvent.press(screen.getByRole("button", { name: "Send code" }));

  expect(await screen.findByText("Too many attempts. Try again in 0:42.")).toBeTruthy();
  expect(screen.getByText("Forgot your password?")).toBeTruthy();
});

it("goes back to the email step for a different address", async () => {
  const api = fakeApi();
  api.answer("POST /api/auth/password-reset", { status: 204 });

  await openForgotPassword();
  await askForCode();
  await fireEvent.press(screen.getByRole("button", { name: "Use a different email" }));

  expect(await screen.findByText("Forgot your password?")).toBeTruthy();
});
