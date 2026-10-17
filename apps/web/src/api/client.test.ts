import { describe, expect, it } from "vitest";
import { ApiError, createApiClient } from "./client";

const alice = { id: "5b0c", email: "alice@example.com", displayName: "Alice", avatarUrl: null };

type Call = { url: string; init: RequestInit };

// Stands in for the network: answers each request with the next queued response.
function fakeServer(...responses: Response[]) {
  const calls: Call[] = [];
  const fetchFn = async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const response = responses.shift();
    if (!response) throw new Error(`Unexpected request to ${String(url)}`);
    return response;
  };
  return { fetchFn, calls };
}

// Stands in for the network: answers each request by what it asks for, whatever the order.
function routedServer(answer: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = async (url: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    await Promise.resolve();
    return answer(call);
  };
  return { fetchFn, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const authorization = (call: Call) => new Headers(call.init.headers).get("Authorization");

describe("api client", () => {
  it("sends no access token before the User is signed in", async () => {
    const server = fakeServer(json(401, { status: 401 }), json(401, { status: 401 }));
    const api = createApiClient(server.fetchFn, {
      onSessionLost: () => {},
      currentPath: () => "/",
    });

    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    expect(authorization(server.calls[0])).toBeNull();
  });

  it("signs the User in on register and sends their access token afterwards", async () => {
    const server = fakeServer(json(201, { accessToken: "token-1", user: alice }), json(200, alice));
    const api = createApiClient(server.fetchFn);

    const registered = await api.register({
      displayName: "Alice",
      email: "alice@example.com",
      password: "correct horse",
    });
    const me = await api.me();

    expect(registered).toEqual(alice);
    expect(me).toEqual(alice);
    expect(server.calls[0].url).toBe("/api/auth/register");
    expect(server.calls[0].init.method).toBe("POST");
    expect(authorization(server.calls[1])).toBe("Bearer token-1");
  });

  // The server rejects any invalid Bearer token, even on public endpoints, so a stale one must not go along.
  it("registers without sending an earlier access token", async () => {
    const server = fakeServer(
      json(201, { accessToken: "token-1", user: alice }),
      json(201, { accessToken: "token-2", user: alice }),
    );
    const api = createApiClient(server.fetchFn);
    const input = { displayName: "Alice", email: "alice@example.com", password: "correct horse" };

    await api.register(input);
    await api.register(input);

    expect(authorization(server.calls[1])).toBeNull();
  });

  it("keeps the current session when registering again fails", async () => {
    const server = fakeServer(
      json(201, { accessToken: "token-1", user: alice }),
      json(409, { status: 409, detail: "This email is already registered" }),
      json(200, alice),
    );
    const api = createApiClient(server.fetchFn);
    const input = { displayName: "Alice", email: "alice@example.com", password: "correct horse" };

    await api.register(input);
    await expect(api.register(input)).rejects.toBeInstanceOf(ApiError);
    await api.me();

    expect(authorization(server.calls[2])).toBe("Bearer token-1");
  });

  it("signs the User in with email and password and sends their access token afterwards", async () => {
    const server = fakeServer(
      json(201, { accessToken: "token-1", user: alice }),
      json(200, { accessToken: "token-2", user: alice }),
      json(200, alice),
    );
    const api = createApiClient(server.fetchFn);
    await api.register({
      displayName: "Alice",
      email: "alice@example.com",
      password: "correct horse",
    });

    const user = await api.login({ email: "alice@example.com", password: "correct horse" });
    await api.me();

    expect(user).toEqual(alice);
    expect(server.calls[1].url).toBe("/api/auth/login");
    expect(server.calls[1].init.method).toBe("POST");
    expect(JSON.parse(String(server.calls[1].init.body))).toEqual({
      email: "alice@example.com",
      password: "correct horse",
    });
    expect(authorization(server.calls[1])).toBeNull();
    expect(authorization(server.calls[2])).toBe("Bearer token-2");
  });

  it("tells how long to wait when the server is limiting attempts", async () => {
    const server = fakeServer(
      new Response(
        JSON.stringify({ status: 429, detail: "Too many failed sign-ins. Try again later." }),
        {
          status: 429,
          headers: { "Content-Type": "application/problem+json", "Retry-After": "120" },
        },
      ),
    );
    const api = createApiClient(server.fetchFn);

    const error = await api
      .login({ email: "alice@example.com", password: "wrong horse" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(429);
    expect((error as ApiError).retryAfterSeconds).toBe(120);
  });

  it("renews the session from the refresh cookie, proving the request comes from the app", async () => {
    const server = fakeServer(json(200, { accessToken: "token-1", user: alice }), json(200, alice));
    const api = createApiClient(server.fetchFn);

    const user = await api.refresh();
    await api.me();

    expect(user).toEqual(alice);
    expect(server.calls[0].url).toBe("/api/auth/refresh");
    expect(server.calls[0].init.method).toBe("POST");
    expect(new Headers(server.calls[0].init.headers).get("X-Requested-With")).toBe("nimbus");
    expect(authorization(server.calls[0])).toBeNull();
    expect(authorization(server.calls[1])).toBe("Bearer token-1");
  });

  it("renews an expired access token and retries the request", async () => {
    const server = fakeServer(
      json(200, { accessToken: "token-1", user: alice }),
      json(401, { status: 401 }),
      json(200, { accessToken: "token-2", user: alice }),
      json(200, alice),
    );
    const api = createApiClient(server.fetchFn);
    await api.refresh();

    const me = await api.me();

    expect(me).toEqual(alice);
    expect(server.calls.map((call) => call.url)).toEqual([
      "/api/auth/refresh",
      "/api/users/me",
      "/api/auth/refresh",
      "/api/users/me",
    ]);
    expect(authorization(server.calls[3])).toBe("Bearer token-2");
  });

  // Each refresh rotates the cookie, so a second one with the same cookie would look like a stolen token.
  it("runs one refresh for all requests that fail at the same time", async () => {
    const server = routedServer((call) => {
      if (call.url === "/api/auth/refresh") return json(200, { accessToken: "fresh", user: alice });
      return authorization(call) === "Bearer fresh" ? json(200, alice) : json(401, { status: 401 });
    });
    const api = createApiClient(server.fetchFn);

    const results = await Promise.all([api.me(), api.me(), api.me()]);

    expect(results).toEqual([alice, alice, alice]);
    expect(server.calls.filter((call) => call.url === "/api/auth/refresh")).toHaveLength(1);
    expect(server.calls.filter((call) => call.url === "/api/users/me")).toHaveLength(6);
  });

  it("shares one refresh between callers asking at the same time", async () => {
    const server = routedServer(() => json(200, { accessToken: "fresh", user: alice }));
    const api = createApiClient(server.fetchFn);

    await Promise.all([api.refresh(), api.refresh()]);

    expect(server.calls).toHaveLength(1);
  });

  it("retries a request only once", async () => {
    const server = routedServer((call) =>
      call.url === "/api/auth/refresh"
        ? json(200, { accessToken: "fresh", user: alice })
        : json(401, { status: 401 }),
    );
    const api = createApiClient(server.fetchFn);

    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(server.calls.map((call) => call.url)).toEqual([
      "/api/users/me",
      "/api/auth/refresh",
      "/api/users/me",
    ]);
  });

  it("tells the User their session expired, remembering this page to come back to, when it can't be renewed", async () => {
    const server = routedServer(() => json(401, { status: 401 }));
    const lost: string[] = [];
    const api = createApiClient(server.fetchFn, {
      onSessionLost: (path) => lost.push(path),
      currentPath: () => "/projects/7?tab=board",
    });

    await expect(api.me()).rejects.toMatchObject({ status: 401 });

    expect(lost).toEqual(["/session-expired?returnTo=%2Fprojects%2F7%3Ftab%3Dboard"]);
  });

  it("keeps the User signed in when renewing fails for a reason other than an ended session", async () => {
    const server = routedServer((call) =>
      call.url === "/api/auth/refresh"
        ? json(429, { status: 429, detail: "Too many requests" })
        : json(401, { status: 401 }),
    );
    const lost: string[] = [];
    const api = createApiClient(server.fetchFn, {
      onSessionLost: (loginPath) => lost.push(loginPath),
      currentPath: () => "/",
    });

    await expect(api.me()).rejects.toMatchObject({ status: 429 });

    expect(lost).toEqual([]);
  });

  // The other request's refresh already rotated the cookie; a second refresh would only cost another rotation.
  it("retries without refreshing again when the token was renewed while the request was out", async () => {
    let releaseSlow: () => void = () => {};
    const slowAnswer = new Promise<void>((resolve) => (releaseSlow = resolve));
    let meCalls = 0;
    const server = routedServer(async (call) => {
      if (call.url === "/api/auth/refresh") return json(200, { accessToken: "fresh", user: alice });
      if (authorization(call) === "Bearer fresh") return json(200, alice);
      if (++meCalls === 1) await slowAnswer;
      return json(401, { status: 401 });
    });
    const api = createApiClient(server.fetchFn);

    const slow = api.me();
    await api.me();
    releaseSlow();
    await slow;

    expect(server.calls.filter((call) => call.url === "/api/auth/refresh")).toHaveLength(1);
  });

  // A refresh answered after sign-in would replace the new session's token (and cookie) with the old one's.
  it("signs in only after a renewal under way has finished, so the new session wins", async () => {
    let answerRefresh: () => void = () => {};
    const refreshAnswered = new Promise<void>((resolve) => (answerRefresh = resolve));
    const server = routedServer(async (call) => {
      if (call.url === "/api/auth/refresh") {
        await refreshAnswered;
        return json(200, { accessToken: "old-session", user: alice });
      }
      if (call.url === "/api/auth/login")
        return json(200, { accessToken: "new-session", user: alice });
      return json(200, alice);
    });
    const api = createApiClient(server.fetchFn);

    const restoring = api.refresh();
    const signingIn = api.login({ email: "alice@example.com", password: "correct horse" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    answerRefresh();
    await Promise.all([restoring, signingIn]);
    await api.me();

    expect(server.calls.map((call) => call.url)).toEqual([
      "/api/auth/refresh",
      "/api/auth/login",
      "/api/users/me",
    ]);
    expect(authorization(server.calls[2])).toBe("Bearer new-session");
  });

  // The old cookie's refresh would rotate it and replace the cookie the sign-in just set.
  it("lets a sign-in under way finish before renewing, so the old session can't replace the new one", async () => {
    let finishLogin: () => void = () => {};
    const loginGate = new Promise<void>((resolve) => (finishLogin = resolve));
    const server = routedServer(async (call) => {
      if (call.url === "/api/auth/login") {
        await loginGate;
        return json(200, { accessToken: "new-session", user: alice });
      }
      if (call.url === "/api/auth/refresh")
        return json(200, { accessToken: "old-session", user: alice });
      return authorization(call) === "Bearer new-session"
        ? json(200, alice)
        : json(401, { status: 401 });
    });
    const api = createApiClient(server.fetchFn);

    const signingIn = api.login({ email: "alice@example.com", password: "correct horse" });
    const me = api.me();
    await new Promise((resolve) => setTimeout(resolve, 0));
    finishLogin();
    await Promise.all([signingIn, me]);

    expect(server.calls.map((call) => call.url)).not.toContain("/api/auth/refresh");
    expect(authorization(server.calls[server.calls.length - 1])).toBe("Bearer new-session");
  });

  it("reports a lost session once, however late the other failing requests arrive", async () => {
    let releaseLate: () => void = () => {};
    const lateGate = new Promise<void>((resolve) => (releaseLate = resolve));
    let meCalls = 0;
    const server = routedServer(async (call) => {
      if (call.url === "/api/users/me" && ++meCalls === 2) await lateGate;
      return json(401, { status: 401 });
    });
    const lost: string[] = [];
    const api = createApiClient(server.fetchFn, {
      onSessionLost: (loginPath) => lost.push(loginPath),
      currentPath: () => "/",
    });

    const first = api.me();
    const late = api.me();
    await expect(first).rejects.toMatchObject({ status: 401 });
    releaseLate();
    await expect(late).rejects.toMatchObject({ status: 401 });

    expect(server.calls.filter((call) => call.url === "/api/auth/refresh")).toHaveLength(1);
    expect(lost).toHaveLength(1);
  });

  it("signs out on the server, proving the request comes from the app, and drops the access token", async () => {
    const server = fakeServer(
      json(200, { accessToken: "token-1", user: alice }),
      new Response(null, { status: 204 }),
      json(401, { status: 401 }),
    );
    const api = createApiClient(server.fetchFn, {
      onSessionLost: () => {},
      currentPath: () => "/",
    });
    await api.refresh();

    await api.logout();
    await api.me().catch(() => {});

    expect(server.calls[1].url).toBe("/api/auth/logout");
    expect(server.calls[1].init.method).toBe("POST");
    expect(new Headers(server.calls[1].init.headers).get("X-Requested-With")).toBe("nimbus");
    expect(authorization(server.calls[2])).toBeNull();
  });

  // The server session is still alive then, and a reload would sign the User straight back in.
  it("stays signed in when signing out fails", async () => {
    const server = fakeServer(
      json(200, { accessToken: "token-1", user: alice }),
      json(503, { status: 503 }),
      json(200, alice),
    );
    const api = createApiClient(server.fetchFn);
    await api.refresh();

    await expect(api.logout()).rejects.toMatchObject({ status: 503 });
    await api.me();

    expect(authorization(server.calls[2])).toBe("Bearer token-1");
  });

  // A refresh answered after sign-out would hand the User a new token and cookie.
  it("lets a refresh under way finish before signing out", async () => {
    let answerRefresh: () => void = () => {};
    const refreshAnswered = new Promise<void>((resolve) => (answerRefresh = resolve));
    const server = routedServer(async (call) => {
      if (call.url === "/api/auth/refresh") {
        await refreshAnswered;
        return json(200, { accessToken: "token-1", user: alice });
      }
      return new Response(null, { status: 204 });
    });
    const api = createApiClient(server.fetchFn);

    const refreshing = api.refresh();
    const signingOut = api.logout();
    await new Promise((resolve) => setTimeout(resolve, 0));
    answerRefresh();
    await Promise.all([refreshing, signingOut]);

    expect(server.calls.map((call) => call.url)).toEqual(["/api/auth/refresh", "/api/auth/logout"]);
  });

  // Otherwise the sign-in lands after sign-out and puts the session, token and cookie back.
  it("lets a sign-in under way finish before signing out", async () => {
    let finishLogin: () => void = () => {};
    const loginGate = new Promise<void>((resolve) => (finishLogin = resolve));
    const server = routedServer(async (call) => {
      if (call.url === "/api/auth/login") {
        await loginGate;
        return json(200, { accessToken: "new-session", user: alice });
      }
      return call.url === "/api/auth/logout" ? new Response(null, { status: 204 }) : json(401, {});
    });
    const api = createApiClient(server.fetchFn, {
      onSessionLost: () => {},
      currentPath: () => "/",
    });

    const signingIn = api.login({ email: "alice@example.com", password: "correct horse" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const signingOut = api.logout();
    await new Promise((resolve) => setTimeout(resolve, 0));
    finishLogin();
    await Promise.all([signingIn, signingOut]);
    await api.me().catch(() => {});

    expect(server.calls.map((call) => call.url)).toEqual([
      "/api/auth/login",
      "/api/auth/logout",
      "/api/users/me",
    ]);
    expect(authorization(server.calls[2])).toBeNull();
  });

  // A refresh now would use the cookie being cleared, or race the logout and write a token back.
  it("does not renew a request that failed while signing out", async () => {
    let finishLogout: () => void = () => {};
    const logoutGate = new Promise<void>((resolve) => (finishLogout = resolve));
    const server = routedServer(async (call) => {
      if (call.url === "/api/auth/refresh")
        return json(200, { accessToken: "token-1", user: alice });
      if (call.url === "/api/auth/logout") {
        await logoutGate;
        return new Response(null, { status: 204 });
      }
      return json(401, { status: 401 });
    });
    const lost: string[] = [];
    const api = createApiClient(server.fetchFn, {
      onSessionLost: (loginPath) => lost.push(loginPath),
      currentPath: () => "/",
    });
    await api.refresh();

    const signingOut = api.logout();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const me = api.me();
    await new Promise((resolve) => setTimeout(resolve, 0));
    finishLogout();
    await signingOut;

    await expect(me).rejects.toMatchObject({ status: 401 });
    expect(server.calls.filter((call) => call.url === "/api/auth/refresh")).toHaveLength(1);
    expect(lost).toEqual([]);
  });

  // The User left on purpose, and the page is already navigating, so no hard reload and no new refresh.
  it("does not renew or redirect when a request fails after signing out", async () => {
    const server = routedServer((call) =>
      call.url === "/api/auth/logout"
        ? new Response(null, { status: 204 })
        : json(401, { status: 401 }),
    );
    const lost: string[] = [];
    const api = createApiClient(server.fetchFn, {
      onSessionLost: (loginPath) => lost.push(loginPath),
      currentPath: () => "/",
    });
    await api.logout();

    await expect(api.me()).rejects.toMatchObject({ status: 401 });

    expect(server.calls.map((call) => call.url)).toEqual(["/api/auth/logout", "/api/users/me"]);
    expect(lost).toEqual([]);
  });

  it("does not send anyone to sign in when renewing on app load fails", async () => {
    const server = routedServer(() => json(401, { status: 401 }));
    const lost: string[] = [];
    const api = createApiClient(server.fetchFn, {
      onSessionLost: (loginPath) => lost.push(loginPath),
    });

    await expect(api.refresh()).rejects.toMatchObject({ status: 401 });

    expect(lost).toEqual([]);
  });

  // The server rejects any invalid Bearer token, even on a public endpoint, so a stale one must not go along.
  it("asks which sign-in providers are enabled without an access token, even when signed in", async () => {
    const server = fakeServer(
      json(201, { accessToken: "token-1", user: alice }),
      json(200, { providers: ["google", "github"] }),
    );
    const api = createApiClient(server.fetchFn);
    await api.register({
      displayName: "Alice",
      email: "alice@example.com",
      password: "correct horse",
    });

    const providers = await api.providers();

    expect(providers).toEqual(["google", "github"]);
    expect(server.calls[1].url).toBe("/api/auth/providers");
    expect(authorization(server.calls[1])).toBeNull();
  });

  // Buttons are optional; the sign-in form still works, so a failure here must not look like a lost session.
  it("does not renew or redirect when asking for providers fails", async () => {
    const server = routedServer(() => json(401, { status: 401 }));
    const lost: string[] = [];
    const api = createApiClient(server.fetchFn, {
      onSessionLost: (loginPath) => lost.push(loginPath),
      currentPath: () => "/login",
    });

    await expect(api.providers()).rejects.toMatchObject({ status: 401 });

    expect(server.calls.map((call) => call.url)).toEqual(["/api/auth/providers"]);
    expect(lost).toEqual([]);
  });

  it("reports field errors from the server", async () => {
    const server = fakeServer(
      json(400, {
        status: 400,
        detail: "Some fields are invalid",
        errors: { email: "must be a well-formed email address" },
      }),
    );
    const api = createApiClient(server.fetchFn);

    const error = await api
      .register({ displayName: "Alice", email: "nope", password: "correct horse" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).fieldErrors).toEqual({
      email: "must be a well-formed email address",
    });
  });
});
