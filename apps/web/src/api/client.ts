import { loginPath } from "../auth/returnPath";

export type User = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

export type RegisterInput = { displayName: string; email: string; password: string };

export type LoginInput = { email: string; password: string };

type AuthResponse = { accessToken: string; user: User };

/** A failed API call, carrying the server's problem details (RFC 9457). */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string>;
  /** From Retry-After on a 429: how long until another attempt may succeed. */
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    detail: string | undefined,
    fieldErrors: Record<string, string> = {},
    retryAfterSeconds: number | null = null,
  ) {
    super(detail ?? `Request failed with status ${status}`);
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type ApiClientOptions = {
  /** Called with the sign-in path (remembering the current page) when the session can't be renewed. */
  onSessionLost?: (loginPath: string) => void;
  /** The page the User is on, to return to after signing in again. */
  currentPath?: () => string;
};

/**
 * Talks to the Nimbus API. The access token lives only in this closure (memory), never in browser
 * storage, so injected scripts can't read it back after a reload. The refresh token is an HttpOnly
 * cookie the browser sends to /api/auth by itself.
 */
export function createApiClient(
  fetchFn: typeof fetch = fetch,
  {
    onSessionLost = (path) => window.location.assign(path),
    currentPath = () => window.location.pathname + window.location.search,
  }: ApiClientOptions = {},
) {
  let accessToken: string | null = null;
  let refreshing: Promise<User> | null = null;

  async function send<T>(path: string, init: RequestInit, authenticated: boolean): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    if (authenticated && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

    const response = await fetchFn(path, { ...init, headers });
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      throw new ApiError(
        response.status,
        body?.detail,
        body?.errors,
        retryAfter > 0 ? retryAfter : null,
      );
    }
    return body as T;
  }

  /**
   * Each refresh rotates the cookie, and the server treats a reused cookie as stolen and ends the
   * session. So everyone asking while one is under way waits for that one instead of starting another.
   */
  function refresh(): Promise<User> {
    refreshing ??= send<AuthResponse>(
      "/api/auth/refresh",
      { method: "POST", headers: { "X-Requested-With": "nimbus" } },
      false,
    )
      .then(({ accessToken: token, user }) => {
        accessToken = token;
        return user;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  // Public endpoints go without the token: the server rejects an expired one even where none is needed.
  async function request<T>(
    path: string,
    init: RequestInit = {},
    { authenticated = true } = {},
  ): Promise<T> {
    const sentWith = accessToken;
    try {
      return await send<T>(path, init, authenticated);
    } catch (error) {
      if (!authenticated || !(error instanceof ApiError) || error.status !== 401) throw error;
    }
    // Another request may have renewed the token while this one was out; then just use the new one.
    if (accessToken === sentWith || accessToken === null) {
      try {
        await refresh();
      } catch (error) {
        // Only a 401 means the session is gone; a rate limit or an outage may pass.
        if (error instanceof ApiError && error.status === 401) {
          accessToken = null;
          onSessionLost(loginPath(currentPath()));
        }
        throw error;
      }
    }
    return send<T>(path, init, authenticated);
  }

  // A refresh under way finishes first; answered later, it would replace the new session's token and
  // cookie with the old session's.
  async function startSession(path: string, input: RegisterInput | LoginInput): Promise<User> {
    await refreshing?.catch(() => {});
    const { accessToken: token, user } = await request<AuthResponse>(
      path,
      { method: "POST", body: JSON.stringify(input) },
      { authenticated: false },
    );
    accessToken = token;
    return user;
  }

  return {
    /** Renews the session from the refresh cookie, e.g. on app load. Rejects when there is none. */
    refresh,

    /** Creates a User and signs them in. Whoever was signed in stays so if it fails. */
    register: (input: RegisterInput) => startSession("/api/auth/register", input),

    /** Signs in with email and password. Whoever was signed in stays so if it fails. */
    login: (input: LoginInput) => startSession("/api/auth/login", input),

    me: () => request<User>("/api/users/me"),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const api = createApiClient((input, init) => fetch(input, init));
