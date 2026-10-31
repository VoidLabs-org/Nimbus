import { fireEvent, screen } from "@testing-library/react-native";
import { ada, comeBackToTheApp, fakeApi, heldBack, renderApp, secureStore } from "../test-support";

const REFRESH_TOKEN = "nimbus.refreshToken";
const unverifiedAda = { ...ada, emailVerified: false };

function session(user: typeof ada, refreshToken: string, accessToken = "access-1") {
  return { accessToken, refreshToken, user };
}

async function openRegister() {
  await renderApp();
  await fireEvent.press(await screen.findByRole("button", { name: "Create an account" }));
  await screen.findByText("Create your account");
}

async function fillIn(name: string, email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText("Name"), name);
  await fireEvent.changeText(screen.getByLabelText("Email"), email);
  await fireEvent.changeText(screen.getByLabelText("Password"), password);
  await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
}

/** A phone that signed in before as a User who hasn't verified their email yet. */
function unverifiedBefore(api: ReturnType<typeof fakeApi>) {
  secureStore.set("nimbus.welcomed", "yes");
  secureStore.set(REFRESH_TOKEN, "stored-1");
  api.answer("POST /api/auth/refresh", {
    status: 200,
    body: session(unverifiedAda, "stored-2"),
  });
}

it("registers, verifies the email with the emailed code and lands signed in", async () => {
  const api = fakeApi();
  api.answer("POST /api/auth/register", {
    status: 201,
    body: session(unverifiedAda, "refresh-1"),
  });
  api.answer("POST /api/auth/verify-email", { status: 200, body: ada });
  api.answer("POST /api/auth/refresh", {
    status: 200,
    body: session(ada, "refresh-2", "access-2"),
  });
  api.answer("GET /api/users/me", { status: 200, body: ada });

  await openRegister();
  await fillIn(" Ada Lovelace ", "ada@example.com ", "correct horse");

  expect(await screen.findByText("Check your email")).toBeTruthy();
  expect(screen.getByText("ada@example.com")).toBeTruthy();
  const [register] = api.to("POST /api/auth/register");
  expect(register!.body).toEqual({
    displayName: "Ada Lovelace",
    email: "ada@example.com",
    password: "correct horse",
  });
  expect(register!.headers.get("X-Nimbus-Client")).toBe("mobile");
  expect(secureStore.get(REFRESH_TOKEN)).toBe("refresh-1");

  // The sixth digit sends the code by itself.
  await fireEvent.changeText(screen.getByLabelText("Verification code"), "419 027");

  expect(await screen.findByText(/Ada Lovelace/)).toBeTruthy();
  const [verify] = api.to("POST /api/auth/verify-email");
  expect(verify!.body).toEqual({ code: "419027" });
  expect(verify!.headers.get("Authorization")).toBe("Bearer access-1");
  // A fresh access token, which says "verified", so the server needn't look the User up on every request.
  expect(api.to("POST /api/auth/refresh")[0]!.body).toEqual({ refreshToken: "refresh-1" });
  expect(secureStore.get(REFRESH_TOKEN)).toBe("refresh-2");
});

describe("the register form", () => {
  it("checks the fields as the web does and sends nothing until they are right", async () => {
    const api = fakeApi();

    await openRegister();
    await fillIn(" ", "ada@example", "short");

    expect(screen.getByText("Enter your name")).toBeTruthy();
    expect(screen.getByText("Enter a valid email address")).toBeTruthy();
    expect(screen.getByText("Use 8 to 128 characters")).toBeTruthy();
    expect(api.to("POST /api/auth/register")).toHaveLength(0);
  });

  it("says when the email is registered already", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/register", {
      status: 409,
      body: { detail: "An account with this email already exists" },
    });

    await openRegister();
    await fillIn("Ada Lovelace", "ada@example.com", "correct horse");

    expect(await screen.findByText("An account with this email already exists")).toBeTruthy();
    expect(secureStore.has(REFRESH_TOKEN)).toBe(false);
  });

  it("sends one registration however often it is submitted", async () => {
    const api = fakeApi();
    const answer = heldBack();
    api.answer("POST /api/auth/register", answer.answer);

    await openRegister();
    await fillIn("Ada Lovelace", "ada@example.com", "correct horse");
    await fireEvent(screen.getByLabelText("Password"), "submitEditing");
    await answer.release({ status: 201, body: session(unverifiedAda, "refresh-1") });

    expect(await screen.findByText("Check your email")).toBeTruthy();
    expect(api.to("POST /api/auth/register")).toHaveLength(1);
  });

  it("goes to Home, not the screen a previous User's Session expired on", async () => {
    const api = fakeApi();
    secureStore.set("nimbus.welcomed", "yes");
    secureStore.set(REFRESH_TOKEN, "stored-1");
    api.answer(
      "POST /api/auth/refresh",
      { status: 200, body: session(ada, "stored-2") },
      { status: 401 },
    );
    api.answer("GET /api/users/me", { status: 401 });

    await renderApp();
    await screen.findByText(/Ada Lovelace/);
    await fireEvent.press(screen.getByText("Settings"));
    await screen.findByRole("button", { name: "Sign out" });
    await comeBackToTheApp(2);
    await fireEvent.press(await screen.findByRole("button", { name: "Sign in again" }));

    api.answer("POST /api/auth/register", { status: 201, body: session(unverifiedAda, "new-1") });
    api.answer("POST /api/auth/verify-email", { status: 200, body: ada });
    api.answer("POST /api/auth/refresh", { status: 200, body: session(ada, "new-2") });
    api.answer("GET /api/users/me", { status: 200, body: ada });
    await fireEvent.press(await screen.findByRole("button", { name: "Create an account" }));
    await fillIn("Ada Lovelace", "ada@example.com", "correct horse");
    await fireEvent.changeText(await screen.findByLabelText("Verification code"), "419027");

    expect(await screen.findByText(/Projects and issues are on the web for now/)).toBeTruthy();
  });

  it("says how long to wait when there were too many tries", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/register", { status: 429, headers: { "Retry-After": "60" } });

    await openRegister();
    await fillIn("Ada Lovelace", "ada@example.com", "correct horse");

    expect(await screen.findByText("Too many attempts. Try again in 1 minute.")).toBeTruthy();
  });
});

describe("the verify-email screen", () => {
  it("is where signing in as an Unverified User lands", async () => {
    const api = fakeApi();
    secureStore.set("nimbus.welcomed", "yes");
    api.answer("POST /api/auth/login", { status: 200, body: session(unverifiedAda, "refresh-1") });

    await renderApp();
    await fireEvent.changeText(await screen.findByLabelText("Email"), "ada@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Check your email")).toBeTruthy();
    expect(screen.queryByText("Home")).toBeNull();
  });

  it("is all an Unverified User sees on reopening the app", async () => {
    const api = fakeApi();
    unverifiedBefore(api);

    await renderApp();

    expect(await screen.findByText("Check your email")).toBeTruthy();
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("says how many tries a wrong code leaves, and clears it", async () => {
    const api = fakeApi();
    unverifiedBefore(api);
    api.answer("POST /api/auth/verify-email", {
      status: 400,
      body: { detail: "Wrong code", code: "invalid_code", triesLeft: 2 },
    });

    await renderApp();
    await fireEvent.changeText(await screen.findByLabelText("Verification code"), "111111");

    expect(await screen.findByText("That code isn’t right. 2 tries left.")).toBeTruthy();
    expect(screen.getByLabelText("Verification code").props.value).toBe("");
  });

  it("says the Session expired when it ends just as the right code goes in", async () => {
    const api = fakeApi();
    unverifiedBefore(api);
    api.answer(
      "POST /api/auth/refresh",
      { status: 200, body: session(unverifiedAda, "stored-2") },
      { status: 401 },
    );
    api.answer("POST /api/auth/verify-email", { status: 200, body: ada });

    await renderApp();
    await fireEvent.changeText(await screen.findByLabelText("Verification code"), "419027");

    expect(await screen.findByText("Your session expired.")).toBeTruthy();
    expect(screen.queryByText(/Projects and issues are on the web for now/)).toBeNull();
  });

  it("says it can't reach Nimbus without a connection, and keeps the code", async () => {
    const api = fakeApi();
    unverifiedBefore(api);
    api.answer("POST /api/auth/verify-email", "offline");

    await renderApp();
    await fireEvent.changeText(await screen.findByLabelText("Verification code"), "419027");

    expect(await screen.findByText(/Can’t reach Nimbus/)).toBeTruthy();
    expect(screen.getByLabelText("Verification code").props.value).toBe("419027");
  });

  it("says when the code is gone", async () => {
    const api = fakeApi();
    unverifiedBefore(api);
    api.answer("POST /api/auth/verify-email", {
      status: 400,
      body: { detail: "Expired", code: "code_expired" },
    });

    await renderApp();
    await fireEvent.changeText(await screen.findByLabelText("Verification code"), "111111");

    expect(
      await screen.findByText(
        "That code has expired, or was cancelled after too many wrong tries.",
      ),
    ).toBeTruthy();
  });

  it("sends a new code, then counts down before Resend works again", async () => {
    const api = fakeApi();
    unverifiedBefore(api);
    api.answer("POST /api/auth/verify-email/resend", { status: 204 });

    await renderApp();
    await fireEvent.press(await screen.findByRole("button", { name: "Resend code" }));

    expect(await screen.findByText("New code sent. Check your inbox.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resend code in 1:00" })).toBeTruthy();
    expect(api.to("POST /api/auth/verify-email/resend")[0]!.headers.get("Authorization")).toBe(
      "Bearer access-1",
    );
  });

  it("waits as long as the server says when the address was mailed too recently", async () => {
    const api = fakeApi();
    unverifiedBefore(api);
    api.answer("POST /api/auth/verify-email/resend", {
      status: 429,
      headers: { "Retry-After": "42" },
    });

    await renderApp();
    await fireEvent.press(await screen.findByRole("button", { name: "Resend code" }));

    expect(await screen.findByRole("button", { name: "Resend code in 0:42" })).toBeTruthy();
  });

  it("opens the app when the email was verified on another device meanwhile", async () => {
    const api = fakeApi();
    unverifiedBefore(api);
    api.answer(
      "POST /api/auth/refresh",
      { status: 200, body: session(unverifiedAda, "stored-2") },
      { status: 200, body: session(ada, "stored-3") },
    );
    api.answer("POST /api/auth/verify-email/resend", { status: 409 });
    api.answer("GET /api/users/me", { status: 200, body: ada });

    await renderApp();
    await fireEvent.press(await screen.findByRole("button", { name: "Resend code" }));

    expect(await screen.findByText(/Ada Lovelace/)).toBeTruthy();
  });

  it("signs out, for a typo in the email", async () => {
    const api = fakeApi();
    unverifiedBefore(api);
    api.answer("POST /api/auth/logout", { status: 204 });

    await renderApp();
    await fireEvent.press(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("Welcome back")).toBeTruthy();
    expect(api.to("POST /api/auth/logout")[0]!.body).toEqual({ refreshToken: "stored-2" });
    expect(secureStore.has(REFRESH_TOKEN)).toBe(false);
  });

  it("stays when Nimbus can't be reached to sign out", async () => {
    const api = fakeApi();
    unverifiedBefore(api);
    api.answer("POST /api/auth/logout", "offline");

    await renderApp();
    await fireEvent.press(await screen.findByRole("button", { name: "Use a different email" }));

    expect(await screen.findByText(/Couldn’t sign out/)).toBeTruthy();
    expect(screen.getByText("Check your email")).toBeTruthy();
  });
});
