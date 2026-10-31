import { fireEvent, screen } from "@testing-library/react-native";
import { ada, browserReturns, fakeApi, renderApp, secureStore } from "../test-support";

const REMEMBERED = "nimbus.rememberedDevices";
// What the faked phone's random bytes and hash (jest.setup.ts) make of the verifier and its challenge.
// 32 bytes of 7 in base64url: "BwcH" for each three, then "Bwc" for the last two.
const VERIFIER = "BwcH".repeat(10) + "Bwc";
const CHALLENGE = "q83vEjRWeJA-_w";

function bothProviders(api: ReturnType<typeof fakeApi>) {
  api.answer("GET /api/auth/providers", {
    status: 200,
    body: { providers: ["google", "github"] },
  });
}

function signedIn() {
  return { status: 200, body: { accessToken: "access-1", refreshToken: "refresh-1", user: ada } };
}

async function openSignIn() {
  secureStore.set("nimbus.welcomed", "yes");
  await renderApp();
  return screen.findByRole("button", { name: "Continue with Google" });
}

it("signs in, or up, with Google through the in-app browser and lands on Home", async () => {
  const api = fakeApi();
  bothProviders(api);
  api.answer("POST /api/auth/app/exchange", signedIn());
  api.answer("GET /api/users/me", { status: 200, body: ada });
  const browser = browserReturns("nimbus://auth?code=c-1");

  await fireEvent.press(await openSignIn());

  expect(await screen.findByText(/Ada Lovelace/)).toBeTruthy();
  expect(browser).toHaveBeenCalledWith(
    `http://localhost:8080/api/auth/oauth2/google?mobile=${CHALLENGE}`,
    "nimbus://auth",
  );
  const [exchange] = api.to("POST /api/auth/app/exchange");
  expect(exchange!.body).toEqual({ code: "c-1", verifier: VERIFIER, rememberedTokens: [] });
  expect(exchange!.headers.get("X-Nimbus-Client")).toBe("mobile");
  expect(secureStore.get("nimbus.refreshToken")).toBe("refresh-1");
});

it("shows only the providers the server offers", async () => {
  const api = fakeApi();
  api.answer("GET /api/auth/providers", { status: 200, body: { providers: ["github"] } });

  secureStore.set("nimbus.welcomed", "yes");
  await renderApp();

  expect(await screen.findByRole("button", { name: "Continue with GitHub" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
});

it("offers them on Create an account too", async () => {
  const api = fakeApi();
  bothProviders(api);

  await renderApp();
  await fireEvent.press(await screen.findByRole("button", { name: "Create an account" }));

  expect(await screen.findByRole("button", { name: "Continue with GitHub" })).toBeTruthy();
});

it("goes on to the Sign-in code for a User with Two-step verification, then remembers the device", async () => {
  const api = fakeApi();
  bothProviders(api);
  api.answer("POST /api/auth/app/exchange", {
    status: 200,
    body: { twoStepRequired: true, pendingToken: "pending-1" },
  });
  api.answer("POST /api/auth/two-step", {
    status: 200,
    body: { ...signedIn().body, rememberedToken: "remembered-1" },
  });
  api.answer("GET /api/users/me", { status: 200, body: ada });
  browserReturns("nimbus://auth?code=c-2");

  await fireEvent.press(await openSignIn());
  await screen.findByText("Two-step verification");
  await fireEvent.press(screen.getByRole("checkbox", { name: "Remember this device for 30 days" }));
  await fireEvent.changeText(screen.getByLabelText("Sign-in code"), "381002");
  await fireEvent.press(screen.getByRole("button", { name: "Verify" }));

  expect(await screen.findByText(/Ada Lovelace/)).toBeTruthy();
  expect(api.to("POST /api/auth/two-step")[0]!.body).toMatchObject({ pendingToken: "pending-1" });
  // Kept under the email the server answered, the one a password sign-in looks it up by.
  expect(JSON.parse(secureStore.get(REMEMBERED)!)).toEqual({
    "ada@example.com": { userId: ada.id, token: "remembered-1" },
  });
});

it("sends every User's remembered device, so the one who signs in skips the code", async () => {
  const api = fakeApi();
  bothProviders(api);
  secureStore.set(
    REMEMBERED,
    JSON.stringify({
      "ada@example.com": { userId: ada.id, token: "remembered-ada" },
      "grace@example.com": { userId: "grace-id", token: "remembered-grace" },
    }),
  );
  api.answer("POST /api/auth/app/exchange", signedIn());
  api.answer("GET /api/users/me", { status: 200, body: ada });
  browserReturns("nimbus://auth?code=c-3");

  await fireEvent.press(await openSignIn());

  await screen.findByText(/Ada Lovelace/);
  expect(api.to("POST /api/auth/app/exchange")[0]!.body).toMatchObject({
    rememberedTokens: ["remembered-ada", "remembered-grace"],
  });
});

describe("when it doesn't work, it says what the web says", () => {
  it.each([
    ["closed", "Sign-in with Google was cancelled."],
    ["nimbus://auth?error=cancelled&provider=google", "Sign-in with Google was cancelled."],
    [
      "nimbus://auth?error=failed&provider=google",
      "Something went wrong signing in with Google. Please try again.",
    ],
  ])("in the browser (%s)", async (outcome, message) => {
    const api = fakeApi();
    bothProviders(api);
    browserReturns(outcome);

    await fireEvent.press(await openSignIn());

    expect(await screen.findByText(message)).toBeTruthy();
    expect(api.to("POST /api/auth/app/exchange")).toHaveLength(0);
  });

  it.each([
    ["email_unverified", /Your Google account needs a verified email address/],
    ["disconnected", /You disconnected Google from your Nimbus account/],
    ["expired", /That took too long. Try signing in with Google again./],
  ])("at the exchange (%s)", async (code, message) => {
    const api = fakeApi();
    bothProviders(api);
    api.answer("POST /api/auth/app/exchange", { status: 400, body: { detail: "No", code } });
    browserReturns("nimbus://auth?code=c-4");

    await fireEvent.press(await openSignIn());

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByText("Welcome back")).toBeTruthy();
  });
});
