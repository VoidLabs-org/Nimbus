import { act, fireEvent, screen } from "@testing-library/react-native";
import { WRONG_RECOVERY_CODE, WRONG_SIGN_IN_CODE } from "@repo/api";
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

it("goes back to the code step for the address the code was sent to", async () => {
  const api = fakeApi();
  api.answer("POST /api/auth/password-reset", { status: 204 });

  await openForgotPassword();
  await askForCode();
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  await fireEvent.press(await screen.findByRole("button", { name: "Enter the code" }));

  expect(await screen.findByLabelText("Reset code")).toBeTruthy();
  expect(api.to("POST /api/auth/password-reset")).toHaveLength(1);
});

it("says why Resend waits when the server refuses a new code", async () => {
  jest.useFakeTimers();
  const api = fakeApi();
  api.answer(
    "POST /api/auth/password-reset",
    { status: 204 },
    {
      status: 429,
      headers: { "Retry-After": "600" },
    },
  );

  await openForgotPassword();
  await askForCode();
  // The first send's minute runs out, one second at a time.
  for (let second = 0; second < 60; second++) {
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  }
  await fireEvent.press(screen.getByRole("button", { name: "Resend code" }));

  expect(await screen.findByText("Too many attempts. Try again in 10:00.")).toBeTruthy();
  jest.useRealTimers();
});

describe("for a User with Two-step verification", () => {
  const twoStepRequired = {
    status: 400,
    body: { detail: "Two-step", code: "two_step_required" },
  };

  async function askedForSecondCode(api: ReturnType<typeof fakeApi>) {
    api.answer("POST /api/auth/password-reset", { status: 204 });
    await openForgotPassword();
    await askForCode();
    await reset("720518", "new horse battery");
    await screen.findByText(
      "Two-step verification is on. Enter the 6-digit code from your authenticator app.",
    );
  }

  it("asks for the Sign-in code too, keeping the Reset code and the password", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/password-reset/confirm", twoStepRequired, { status: 204 });

    await askedForSecondCode(api);
    expect(screen.getByLabelText("Reset code").props.value).toBe("720518");
    expect(screen.getByLabelText("New password").props.value).toBe("new horse battery");
    await fireEvent.changeText(screen.getByLabelText("Sign-in code"), "381002");
    await fireEvent.press(screen.getByRole("button", { name: "Reset password" }));

    expect(
      await screen.findByText("Password updated. You were signed out on other devices."),
    ).toBeTruthy();
    expect(api.to("POST /api/auth/password-reset/confirm")[1]!.body).toEqual({
      email: "ada@example.com",
      code: "720518",
      newPassword: "new horse battery",
      twoStepCode: "381002",
    });
  });

  it("takes a Recovery code instead", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/password-reset/confirm", twoStepRequired, { status: 204 });

    await askedForSecondCode(api);
    await fireEvent.press(screen.getByRole("button", { name: "Use a recovery code" }));
    await fireEvent.changeText(await screen.findByLabelText("Recovery code"), "k7qx-2m9d");
    await fireEvent.press(screen.getByRole("button", { name: "Reset password" }));

    await screen.findByText("Password updated. You were signed out on other devices.");
    expect(api.to("POST /api/auth/password-reset/confirm")[1]!.body).toMatchObject({
      recoveryCode: "k7qx-2m9d",
    });
  });

  it("says a wrong Sign-in code didn't work, and clears it", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/password-reset/confirm", twoStepRequired, {
      status: 400,
      body: { detail: "Wrong", code: "invalid_two_step_code" },
    });

    await askedForSecondCode(api);
    await fireEvent.changeText(screen.getByLabelText("Sign-in code"), "999999");
    await fireEvent.press(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText(WRONG_SIGN_IN_CODE)).toBeTruthy();
    expect(screen.getByLabelText("Sign-in code").props.value).toBe("");
  });

  it("says a wrong Recovery code isn't right or was used", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/password-reset/confirm", twoStepRequired, {
      status: 400,
      body: { detail: "Wrong", code: "invalid_two_step_code" },
    });

    await askedForSecondCode(api);
    await fireEvent.press(screen.getByRole("button", { name: "Use a recovery code" }));
    await fireEvent.changeText(await screen.findByLabelText("Recovery code"), "aaaa-bbbb");
    await fireEvent.press(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText(WRONG_RECOVERY_CODE)).toBeTruthy();
  });
});
