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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const authorization = (call: Call) => new Headers(call.init.headers).get("Authorization");

describe("api client", () => {
  it("sends no access token before the User is signed in", async () => {
    const server = fakeServer(json(401, { status: 401 }));
    const api = createApiClient(server.fetchFn);

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
