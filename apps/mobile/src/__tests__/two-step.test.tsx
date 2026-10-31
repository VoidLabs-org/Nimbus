import { fireEvent, screen } from "@testing-library/react-native";
import { ada, fakeApi, renderApp, secureStore } from "../test-support";

const PENDING = "nimbus.pendingSignIn";
const REMEMBERED = "nimbus.rememberedDevices";

function signedIn(extra: Record<string, string> = {}) {
  return {
    status: 200,
    body: { accessToken: "access-1", refreshToken: "refresh-1", user: ada, ...extra },
  };
}

const codeNeeded = { status: 200, body: { twoStepRequired: true, pendingToken: "pending-1" } };

async function signInWith(email = "ada@example.com") {
  await fireEvent.changeText(await screen.findByLabelText("Email"), email);
  await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse");
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
}

async function openTwoStep(api: ReturnType<typeof fakeApi>) {
  secureStore.set("nimbus.welcomed", "yes");
  api.answer("POST /api/auth/login", codeNeeded);
  await renderApp();
  await signInWith();
  await screen.findByText("Two-step verification");
}

async function enterCode(code: string) {
  await fireEvent.changeText(screen.getByLabelText("Sign-in code"), code);
  await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
}

function problem(status: number, code: string, triesLeft?: number) {
  return {
    status,
    body: { detail: "No", code, ...(triesLeft === undefined ? {} : { triesLeft }) },
  };
}

it("asks for the Sign-in code after the password, then lands on Home", async () => {
  const api = fakeApi();
  api.answer("POST /api/auth/two-step", signedIn());
  api.answer("GET /api/users/me", { status: 200, body: ada });

  await openTwoStep(api);
  expect(secureStore.get(PENDING)).toBe("pending-1");
  await enterCode("381002");

  expect(await screen.findByText(/Ada Lovelace/)).toBeTruthy();
  const [twoStep] = api.to("POST /api/auth/two-step");
  expect(twoStep!.body).toEqual({
    pendingToken: "pending-1",
    code: "381002",
    rememberBrowser: false,
  });
  expect(twoStep!.headers.get("X-Nimbus-Client")).toBe("mobile");
  expect(secureStore.get("nimbus.refreshToken")).toBe("refresh-1");
  expect(secureStore.has(PENDING)).toBe(false);
});

it("takes a Recovery code instead", async () => {
  const api = fakeApi();
  api.answer("POST /api/auth/two-step", signedIn());
  api.answer("GET /api/users/me", { status: 200, body: ada });

  await openTwoStep(api);
  await fireEvent.press(screen.getByRole("button", { name: "Use a recovery code" }));
  await fireEvent.changeText(await screen.findByLabelText("Recovery code"), "k7qx-2m9d");
  await fireEvent.press(screen.getByRole("button", { name: "Verify" }));

  expect(await screen.findByText(/Ada Lovelace/)).toBeTruthy();
  expect(api.to("POST /api/auth/two-step")[0]!.body).toEqual({
    pendingToken: "pending-1",
    recoveryCode: "k7qx-2m9d",
    rememberBrowser: false,
  });
});

describe("when the code doesn't work", () => {
  it("says how many tries a wrong Sign-in code leaves", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/two-step", problem(400, "invalid_code", 4));

    await openTwoStep(api);
    await enterCode("999999");

    expect(await screen.findByText("That code isn’t right. 4 tries left.")).toBeTruthy();
  });

  it("says a Recovery code is wrong or used, with the tries left", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/two-step", problem(400, "invalid_code", 3));

    await openTwoStep(api);
    await fireEvent.press(screen.getByRole("button", { name: "Use a recovery code" }));
    await fireEvent.changeText(await screen.findByLabelText("Recovery code"), "aaaa-bbbb");
    await fireEvent.press(screen.getByRole("button", { name: "Verify" }));

    expect(
      await screen.findByText(
        "That recovery code isn’t right, or it was used already. 3 tries left.",
      ),
    ).toBeTruthy();
  });

  it("goes back to Sign in when the pending sign-in timed out or ended", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/two-step", problem(401, "sign_in_expired"));

    await openTwoStep(api);
    await enterCode("381002");

    expect(await screen.findByText("Your sign-in timed out. Sign in again.")).toBeTruthy();
    expect(screen.getByText("Welcome back")).toBeTruthy();
    expect(secureStore.has(PENDING)).toBe(false);
  });

  it("counts down the wait while the User is over the hourly lock", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/two-step", { status: 429, headers: { "Retry-After": "120" } });

    await openTwoStep(api);
    await enterCode("381002");

    expect(await screen.findByText("Too many attempts. Try again in 2:00.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Verify" })).toBeDisabled();
  });
});

describe("remembering this device", () => {
  it("skips the code at the next sign-in", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/two-step", signedIn({ rememberedToken: "remembered-1" }));
    api.answer("GET /api/users/me", { status: 200, body: ada });
    api.answer("POST /api/auth/logout", { status: 204 });

    await openTwoStep(api);
    await fireEvent.press(
      screen.getByRole("checkbox", { name: "Remember this device for 30 days" }),
    );
    await enterCode("381002");
    await screen.findByText(/Ada Lovelace/);
    expect(api.to("POST /api/auth/two-step")[0]!.body).toMatchObject({ rememberBrowser: true });

    // Signing out keeps the remembered device; signing in again sends it, and no code is asked.
    await fireEvent.press(screen.getByText("Settings"));
    await fireEvent.press(await screen.findByRole("button", { name: "Sign out" }));
    const buttons = await screen.findAllByRole("button", { name: "Sign out" });
    await fireEvent.press(buttons[buttons.length - 1]!);
    api.answer("POST /api/auth/login", signedIn());
    await signInWith("Ada@Example.com");

    expect(await screen.findByText(/Ada Lovelace/)).toBeTruthy();
    expect(api.to("POST /api/auth/login")[1]!.body).toEqual({
      email: "Ada@Example.com",
      password: "correct horse",
      rememberedToken: "remembered-1",
    });
  });

  it("sends a remembered device only for the User it was remembered for", async () => {
    const api = fakeApi();
    secureStore.set("nimbus.welcomed", "yes");
    secureStore.set(REMEMBERED, JSON.stringify({ "grace@example.com": "remembered-grace" }));
    api.answer("POST /api/auth/login", signedIn());
    api.answer("GET /api/users/me", { status: 200, body: ada });

    await renderApp();
    await signInWith("ada@example.com");

    await screen.findByText(/Ada Lovelace/);
    expect(api.to("POST /api/auth/login")[0]!.body).not.toHaveProperty("rememberedToken");
  });

  it("forgets a remembered device the server no longer knows", async () => {
    const api = fakeApi();
    secureStore.set("nimbus.welcomed", "yes");
    secureStore.set(REMEMBERED, JSON.stringify({ "ada@example.com": "remembered-old" }));
    api.answer("POST /api/auth/login", codeNeeded);

    await renderApp();
    await signInWith("ada@example.com");

    expect(await screen.findByText("Two-step verification")).toBeTruthy();
    expect(JSON.parse(secureStore.get(REMEMBERED)!)).toEqual({});
  });
});
