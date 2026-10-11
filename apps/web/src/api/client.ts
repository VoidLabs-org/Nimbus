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
  // The sign-in or sign-out under way, if any. Refreshes and failed requests wait for it.
  let starting: Promise<unknown> | null = null;
  // Counts changes to the credentials (every finished refresh, every sign-in). A request that failed
  // before the latest change is judged against that change, not by starting yet another refresh.
  let credentialChanges = 0;
  let lostReported = false;

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

  // Endpoints the refresh cookie alone authenticates. The header is what keeps other sites from using it.
  function cookieOnlyPost<T>(path: string): Promise<T> {
    return send<T>(path, { method: "POST", headers: { "X-Requested-With": "nimbus" } }, false);
  }

  // Marks a sign-in or sign-out as under way until it settles.
  function inFlight<T>(operation: Promise<T>): Promise<T> {
    starting = operation;
    return operation.finally(() => {
      if (starting === operation) starting = null;
    });
  }

  /**
   * Each refresh rotates the cookie, and the server treats a reused cookie as stolen and ends the
   * session. So everyone asking while one is under way waits for that one instead of starting another.
   * A sign-in or sign-out under way finishes first: a refresh answered after it would replace the new
   * session's token and cookie, or bring back the one just ended.
   */
  function refresh(): Promise<User> {
    refreshing ??= (starting?.catch(() => {}) ?? Promise.resolve())
      .then(() => cookieOnlyPost<AuthResponse>("/api/auth/refresh"))
      .then(({ accessToken: token, user }) => {
        accessToken = token;
        lostReported = false;
        return user;
      })
      .finally(() => {
        credentialChanges++;
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
    const changesWhenSent = credentialChanges;
    try {
      return await send<T>(path, init, authenticated);
    } catch (error) {
      if (!authenticated || !(error instanceof ApiError) || error.status !== 401) throw error;
      await starting?.catch(() => {});
      if (lostReported) {
        // Signed out, or the session was lost and reported: there is nothing to renew.
        throw error;
      }
      if (credentialChanges === changesWhenSent) {
        await renew();
      } else if (accessToken === null) {
        // The session was lost, and reported, while this request was out.
        throw error;
      }
    }
    return send<T>(path, init, authenticated);
  }

  async function renew() {
    try {
      await refresh();
    } catch (error) {
      // Only a 401 means the session is gone; a rate limit or an outage may pass.
      if (error instanceof ApiError && error.status === 401 && !lostReported) {
        lostReported = true;
        accessToken = null;
        onSessionLost(loginPath(currentPath()));
      }
      throw error;
    }
  }

  // Waits for a refresh under way, so it can't answer after this and replace the new session.
  function startSession(path: string, input: RegisterInput | LoginInput): Promise<User> {
    return inFlight(
      (async () => {
        await refreshing?.catch(() => {});
        const { accessToken: token, user } = await request<AuthResponse>(
          path,
          { method: "POST", body: JSON.stringify(input) },
          { authenticated: false },
        );
        accessToken = token;
        lostReported = false;
        credentialChanges++;
        return user;
      })(),
    );
  }

  return {
    /** Renews the session from the refresh cookie, e.g. on app load. Rejects when there is none. */
    refresh,

    /**
     * Ends this browser's session on the server and forgets the access token. If the server can't be
     * reached the User stays signed in, because the session would otherwise live on and a reload would
     * sign them straight back in. A sign-in or refresh under way finishes first, so it can't bring the
     * session back. Afterwards the User is gone on purpose: failing requests are not renewed and send no
     * one to sign in, until the next sign-in.
     */
    logout: () =>
      inFlight(
        (async () => {
          await starting?.catch(() => {});
          await refreshing?.catch(() => {});
          await cookieOnlyPost<void>("/api/auth/logout");
          accessToken = null;
          lostReported = true;
          credentialChanges++;
        })(),
      ),

    /** Creates a User and signs them in. Whoever was signed in stays so if it fails. */
    register: (input: RegisterInput) => startSession("/api/auth/register", input),

    /** Signs in with email and password. Whoever was signed in stays so if it fails. */
    login: (input: LoginInput) => startSession("/api/auth/login", input),

    me: () => request<User>("/api/users/me"),

    /** Changes the display name and returns the updated User. */
    updateProfile: (input: { displayName: string }) =>
      request<User>("/api/users/me", { method: "PATCH", body: JSON.stringify(input) }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const api = createApiClient((input, init) => fetch(input, init));
