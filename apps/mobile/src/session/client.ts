import { ApiError, apiErrorFrom, NetworkError } from "@repo/api";
import type { components } from "@repo/api/schema";

export type User = components["schemas"]["User"];

/** Where the refresh token is kept between launches: the phone's secure storage (ADR 0010). */
export type TokenStore = {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
};

type AuthResponse = { accessToken: string; refreshToken: string; user: User };

/** What a right password led to: a Session, or (with Two-step verification) a Sign-in code still to give. */
export type SignInOutcome = { user: User } | { twoStepRequired: true };

export type MobileApiOptions = {
  baseUrl: string;
  store: TokenStore;
  userAgent: string;
  /** Called once when the Session can no longer be renewed (a 401 from refresh), after the stored token is gone. */
  onSessionLost: () => void;
  fetchFn?: typeof fetch;
};

/**
 * Talks to the Nimbus API as the Mobile app (`X-Nimbus-Client: mobile`): the refresh token travels in the body and
 * lives in the phone's secure storage; the access token lives only in memory. Like the web client it renews one
 * refresh at a time, because the server ends the Session when a used refresh token comes back.
 */
export function createMobileApi({
  baseUrl,
  store,
  userAgent,
  onSessionLost,
  fetchFn = (input, init) => fetch(input, init),
}: MobileApiOptions) {
  let accessToken: string | null = null;
  let refreshing: Promise<User> | null = null;

  async function send<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("X-Nimbus-Client", "mobile");
    headers.set("User-Agent", userAgent);
    headers.set("Accept", "application/json");
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    if (authenticated && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

    let response: Response;
    try {
      response = await fetchFn(baseUrl + path, { ...init, headers });
    } catch (failure) {
      throw new NetworkError(failure);
    }
    const body = await response.json().catch(() => undefined);
    if (!response.ok)
      throw apiErrorFrom(response.status, body, response.headers.get("Retry-After"));
    return body as T;
  }

  async function started(answer: AuthResponse): Promise<User> {
    await store.set(answer.refreshToken);
    accessToken = answer.accessToken;
    return answer.user;
  }

  /**
   * Renews the Session from the stored refresh token. Everyone asking while one is under way waits for it. Rejects
   * with a 401 ApiError when there is no Session to renew, and clears the stored token then.
   */
  function refresh(): Promise<User> {
    refreshing ??= (async () => {
      const refreshToken = await store.get();
      if (!refreshToken) throw new ApiError(401, "Not signed in");
      try {
        return await started(
          await send<AuthResponse>(
            "/api/auth/refresh",
            { method: "POST", body: JSON.stringify({ refreshToken }) },
            false,
          ),
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          accessToken = null;
          await store.clear();
        }
        throw error;
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  /** An authenticated call. A 401 renews the Session once and tries again; if it can't be renewed, it is lost. */
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const tokenWhenSent = accessToken;
    try {
      return await send<T>(path, init);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
    }
    if (accessToken === tokenWhenSent) {
      try {
        await refresh();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) onSessionLost();
        throw error;
      }
    }
    return send<T>(path, init);
  }

  return {
    refresh,

    /** Whether a refresh token is stored, i.e. this phone was signed in when the app last ran. */
    hasStoredSession: async () => (await store.get()) !== null,

    /**
     * Signs in with email and password. A User with Two-step verification gets no Session yet: the app can't take
     * the code until the Two-step ticket, so the answer says a code is needed and nothing is stored.
     */
    signIn: async (email: string, password: string): Promise<SignInOutcome> => {
      const answer = await send<AuthResponse | { twoStepRequired: true }>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) },
        false,
      );
      if ("twoStepRequired" in answer) return { twoStepRequired: true };
      return { user: await started(answer) };
    },

    /**
     * Ends this phone's Session on the server, then forgets it. If the server can't be reached the User stays
     * signed in, as on the web: the Session would otherwise live on unseen.
     */
    signOut: async () => {
      const refreshToken = await store.get();
      if (refreshToken) {
        await send<void>(
          "/api/auth/logout",
          { method: "POST", body: JSON.stringify({ refreshToken }) },
          false,
        );
      }
      accessToken = null;
      await store.clear();
    },

    me: () => request<User>("/api/users/me"),
  };
}

export type MobileApi = ReturnType<typeof createMobileApi>;
