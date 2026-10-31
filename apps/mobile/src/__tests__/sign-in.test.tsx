import { fireEvent, screen } from "@testing-library/react-native";
import { ada, fakeApi, renderApp, secureStore } from "../test-support";

function signedIn(refreshToken = "refresh-1") {
  return { status: 200, body: { accessToken: "access-1", refreshToken, user: ada } };
}

async function signInWith(email: string, password: string) {
  await fireEvent.changeText(await screen.findByLabelText("Email"), email);
  await fireEvent.changeText(screen.getByLabelText("Password"), password);
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
}

it("welcomes a first launch, signs in and lands on Home", async () => {
  const api = fakeApi();
  api.answer("POST /api/auth/login", signedIn());
  api.answer("GET /api/users/me", { status: 200, body: ada });

  await renderApp();
  await fireEvent.press(await screen.findByRole("button", { name: "Sign in" }));
  await signInWith("ada@example.com ", "correct horse");

  expect(await screen.findByText(/Ada Lovelace/)).toBeTruthy();
  expect(screen.getByText(/Projects and issues are on the web for now/)).toBeTruthy();
  const [login] = api.to("POST /api/auth/login");
  expect(login!.body).toEqual({ email: "ada@example.com", password: "correct horse" });
  expect(login!.headers.get("X-Nimbus-Client")).toBe("mobile");
  expect(login!.headers.get("User-Agent")).toMatch(/^Nimbus\/\S+ \(/);
  expect([...secureStore.values()]).toContain("refresh-1");
});

describe("when signing in doesn't work", () => {
  async function openSignIn() {
    await renderApp();
    await fireEvent.press(await screen.findByRole("button", { name: "Sign in" }));
  }

  it("says the email or password is wrong, as on the web, and stores nothing", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/login", {
      status: 401,
      body: { detail: "Invalid email or password" },
    });

    await openSignIn();
    await signInWith("ada@example.com", "wrong");

    expect(await screen.findByText("Invalid email or password.")).toBeTruthy();
    expect(secureStore.size).toBe(1); // only "seen Welcome"
  });

  it("says how long to wait when the email is blocked", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/login", { status: 429, headers: { "Retry-After": "120" } });

    await openSignIn();
    await signInWith("ada@example.com", "wrong");

    expect(await screen.findByText("Too many attempts. Try again in 2 minutes.")).toBeTruthy();
  });

  it("tells a User with Two-step verification it isn't in the app yet", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/login", { status: 200, body: { twoStepRequired: true } });

    await openSignIn();
    await signInWith("ada@example.com", "correct horse");

    expect(
      await screen.findByText(/Two-step verification isn’t available in the app yet/),
    ).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("says it can't reach Nimbus without a connection", async () => {
    const api = fakeApi();
    api.answer("POST /api/auth/login", "offline");

    await openSignIn();
    await signInWith("ada@example.com", "correct horse");

    expect(await screen.findByText(/Can’t reach Nimbus/)).toBeTruthy();
  });
});

it("opens on Sign in, not Welcome, once Welcome was left", async () => {
  fakeApi();
  secureStore.set("nimbus.welcomed", "yes");

  await renderApp();

  expect(await screen.findByText("Welcome back")).toBeTruthy();
  expect(screen.queryByText(/Projects, issues, boards/)).toBeNull();
});
