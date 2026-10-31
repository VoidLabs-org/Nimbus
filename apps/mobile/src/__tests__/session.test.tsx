import { fireEvent, screen } from "@testing-library/react-native";
import { ada, comeBackToTheApp, fakeApi, heldBack, renderApp, secureStore } from "../test-support";

const REFRESH_TOKEN = "nimbus.refreshToken";

/** A phone that signed in before: Welcome left, and a refresh token stored. */
function signedInBefore(token = "stored-1") {
  secureStore.set("nimbus.welcomed", "yes");
  secureStore.set(REFRESH_TOKEN, token);
}

function renewed(refreshToken: string) {
  return { status: 200, body: { accessToken: "access-2", refreshToken, user: ada } };
}

describe("reopening the app", () => {
  it("renews the stored Session and opens on Home without the form", async () => {
    const api = fakeApi();
    signedInBefore();
    api.answer("POST /api/auth/refresh", renewed("stored-2"));
    api.answer("GET /api/users/me", { status: 200, body: ada });

    await renderApp();

    expect(await screen.findByText(/Ada Lovelace/)).toBeTruthy();
    expect(screen.queryByLabelText("Password")).toBeNull();
    const [refresh] = api.to("POST /api/auth/refresh");
    expect(refresh!.body).toEqual({ refreshToken: "stored-1" });
    expect(refresh!.headers.get("X-Nimbus-Client")).toBe("mobile");
    expect(secureStore.get(REFRESH_TOKEN)).toBe("stored-2");
    // The renewal brought the User; reading them again straight away would only repeat it.
    expect(api.to("GET /api/users/me")).toHaveLength(0);
  });

  it("says the Session expired when the server ended it, and forgets the token", async () => {
    const api = fakeApi();
    signedInBefore();
    api.answer("POST /api/auth/refresh", { status: 401 });
    api.answer("POST /api/auth/login", renewed("fresh-1"));
    api.answer("GET /api/users/me", { status: 200, body: ada });

    await renderApp();

    expect(await screen.findByText("Your session expired.")).toBeTruthy();
    expect(secureStore.has(REFRESH_TOKEN)).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Sign in again" }));
    await fireEvent.changeText(await screen.findByLabelText("Email"), "ada@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/Ada Lovelace/)).toBeTruthy();
  });

  it("shows the offline screen without signing out, and Try again carries on", async () => {
    const api = fakeApi();
    signedInBefore();
    api.answer("POST /api/auth/refresh", "offline", renewed("stored-2"));
    api.answer("GET /api/users/me", { status: 200, body: ada });

    await renderApp();

    expect(await screen.findByText("You’re offline.")).toBeTruthy();
    expect(secureStore.get(REFRESH_TOKEN)).toBe("stored-1");
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Ada Lovelace/)).toBeTruthy();
  });

  it("shows the server-error screen without signing out; Sign out there forgets this phone", async () => {
    const api = fakeApi();
    signedInBefore();
    api.answer("POST /api/auth/refresh", { status: 503 });

    await renderApp();

    expect(await screen.findByText("Something went wrong on our side")).toBeTruthy();
    expect(secureStore.get(REFRESH_TOKEN)).toBe("stored-1");
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText("Welcome back")).toBeTruthy();
    expect(secureStore.has(REFRESH_TOKEN)).toBe(false);
  });
});

describe("coming back to the app", () => {
  it("reads the User again, so a new name shows", async () => {
    const api = fakeApi();
    signedInBefore();
    api.answer("POST /api/auth/refresh", renewed("stored-2"));
    api.answer("GET /api/users/me", { status: 200, body: { ...ada, displayName: "Ada King" } });

    await renderApp();
    await screen.findByText(/Ada Lovelace/);
    await comeBackToTheApp(2);

    expect(await screen.findByText(/Ada King/)).toBeTruthy();
    expect(api.to("GET /api/users/me")[0]!.headers.get("Authorization")).toBe("Bearer access-2");
  });
});

it("says the Session expired when it ends while the app is open", async () => {
  const api = fakeApi();
  signedInBefore();
  api.answer("POST /api/auth/refresh", renewed("stored-2"), { status: 401 });
  api.answer("GET /api/users/me", { status: 401 });

  await renderApp();
  await screen.findByText(/Ada Lovelace/);
  await comeBackToTheApp(2);

  expect(await screen.findByText("Your session expired.")).toBeTruthy();
  expect(api.to("POST /api/auth/refresh")).toHaveLength(2);
  expect(api.to("POST /api/auth/refresh")[1]!.body).toEqual({ refreshToken: "stored-2" });
  expect(secureStore.has(REFRESH_TOKEN)).toBe(false);
});

describe("signing out", () => {
  async function openSignOutSheet() {
    await renderApp();
    await screen.findByText(/Ada Lovelace/);
    await fireEvent.press(screen.getByText("Settings"));
    await fireEvent.press(await screen.findByRole("button", { name: "Sign out" }));
    return await screen.findByText("Sign out?");
  }

  it("ends this phone's Session on the server and forgets it", async () => {
    const api = fakeApi();
    signedInBefore();
    api.answer("POST /api/auth/refresh", renewed("stored-2"));
    api.answer("GET /api/users/me", { status: 200, body: ada });
    api.answer("POST /api/auth/logout", { status: 204 });

    await openSignOutSheet();
    const buttons = screen.getAllByRole("button", { name: "Sign out" });
    await fireEvent.press(buttons[buttons.length - 1]!);

    expect(await screen.findByText("Welcome back")).toBeTruthy();
    expect(api.to("POST /api/auth/logout")[0]!.body).toEqual({ refreshToken: "stored-2" });
    expect(secureStore.has(REFRESH_TOKEN)).toBe(false);
  });

  it("stays signed in when Nimbus can't be reached", async () => {
    const api = fakeApi();
    signedInBefore();
    api.answer("POST /api/auth/refresh", renewed("stored-2"));
    api.answer("GET /api/users/me", { status: 200, body: ada });
    api.answer("POST /api/auth/logout", "offline");

    await openSignOutSheet();
    const buttons = screen.getAllByRole("button", { name: "Sign out" });
    await fireEvent.press(buttons[buttons.length - 1]!);

    expect(await screen.findByText(/so you’re still signed in/)).toBeTruthy();
    expect(secureStore.get(REFRESH_TOKEN)).toBe("stored-2");
  });

  it("waits for a renewal under way, then ends the renewed Session", async () => {
    const api = fakeApi();
    signedInBefore();
    const renewal = heldBack();
    api.answer("POST /api/auth/refresh", renewed("stored-2"), renewal.answer);
    api.answer("GET /api/users/me", { status: 401 }, { status: 200, body: ada });
    api.answer("POST /api/auth/logout", { status: 204 });

    await renderApp();
    await screen.findByText(/Ada Lovelace/);
    await comeBackToTheApp(2); // GET /me is refused, so a renewal starts and is held
    await fireEvent.press(screen.getByText("Settings"));
    await fireEvent.press(await screen.findByRole("button", { name: "Sign out" }));
    await screen.findByText("Sign out?");
    const buttons = screen.getAllByRole("button", { name: "Sign out" });
    await fireEvent.press(buttons[buttons.length - 1]!);
    await renewal.release(renewed("stored-3"));

    expect(await screen.findByText("Welcome back")).toBeTruthy();
    expect(api.to("POST /api/auth/logout")[0]!.body).toEqual({ refreshToken: "stored-3" });
    expect(secureStore.has(REFRESH_TOKEN)).toBe(false);
  });

  it("offers signing out on this phone only when the server fails", async () => {
    const api = fakeApi();
    signedInBefore();
    api.answer("POST /api/auth/refresh", renewed("stored-2"));
    api.answer("POST /api/auth/logout", { status: 503 });

    await openSignOutSheet();
    const buttons = screen.getAllByRole("button", { name: "Sign out" });
    await fireEvent.press(buttons[buttons.length - 1]!);

    expect(await screen.findByText(/couldn’t sign you out just now/)).toBeTruthy();
    expect(screen.queryByText(/Check your connection/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out on this phone only" }));
    expect(await screen.findByText("Welcome back")).toBeTruthy();
    expect(secureStore.has(REFRESH_TOKEN)).toBe(false);
  });

  it("can be cancelled", async () => {
    const api = fakeApi();
    signedInBefore();
    api.answer("POST /api/auth/refresh", renewed("stored-2"));
    api.answer("GET /api/users/me", { status: 200, body: ada });

    await openSignOutSheet();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Sign out?")).toBeNull();
    expect(api.to("POST /api/auth/logout")).toHaveLength(0);
    expect(screen.getByRole("header", { name: "Settings" })).toBeTruthy();
  });
});
