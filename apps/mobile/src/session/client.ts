import { ApiError, apiErrorFrom, NetworkError } from "@repo/api";
import type { components } from "@repo/api/schema";

export type User = components["schemas"]["User"];
export type RegisterInput = components["schemas"]["RegisterRequest"];
/** A Reset code and the new password; the app has no Sign-in code to add yet (#203). */
export type ResetPasswordInput = { email: string; code: string; newPassword: string };

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
 * is kept in the phone's secure storage; the access token lives only in memory. As on the web, one refresh runs at a
 * time, because the server ends the Session when a used refresh token comes back, and signing in or out waits for a
 * refresh under way so it can't write back a token afterwards.
 */
export function createMobileApi({
  baseUrl,
  store,
  userAgent,
  onSessionLost,
  fetchFn = (input, init) => fetch(input, init),
}: MobileApiOptions) {
  let accessToken: string | null = null;
  // The refresh token in use. Memory is what counts while the app runs, and storage keeps it between launches:
  // undefined until storage has been read, null when there is none.
  let refreshToken: string | null | undefined;
  let refreshing: Promise<User> | null = null;
  // Counts sign-ins and sign-outs. A refresh that started before one of them throws its answer away.
  let generation = 0;
  // Set once a lost Session was reported, or the User signed out on purpose, until the next sign-in.
  let lostReported = false;

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

  async function storedRefreshToken(): Promise<string | null> {
    if (refreshToken === undefined) refreshToken = await store.get();
    return refreshToken;
  }

  /**
   * Takes a new Session's tokens. The server has already retired the previous refresh token, so the new one is kept
   * in memory first; if the phone can't store it, this launch carries on and only the next one has to sign in again.
   */
  async function keep(answer: AuthResponse): Promise<User> {
    refreshToken = answer.refreshToken;
    accessToken = answer.accessToken;
    lostReported = false;
    try {
      await store.set(answer.refreshToken);
    } catch (failure) {
      console.warn(
        "Couldn't store the refresh token; signing in will be needed on the next launch",
        failure,
      );
    }
    return answer.user;
  }

  async function drop() {
    accessToken = null;
    refreshToken = null;
    await store.clear();
  }

  /** Lets a refresh under way finish first, whether it works or not. */
  async function settled() {
    await refreshing?.catch(() => {});
  }

  /**
   * Renews the Session from the refresh token. Everyone asking while one is under way waits for it. Rejects with a
   * 401 ApiError when there is no Session to renew, and forgets the token then.
   */
  function refresh(): Promise<User> {
    refreshing ??= (async () => {
      const startedIn = generation;
      const token = await storedRefreshToken();
      if (!token) throw new ApiError(401, "Not signed in");
      let answer: AuthResponse;
      try {
        answer = await send<AuthResponse>(
          "/api/auth/refresh",
          { method: "POST", body: JSON.stringify({ refreshToken: token }) },
          false,
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && startedIn === generation)
          await drop();
        throw error;
      }
      if (startedIn !== generation) throw new ApiError(401, "Signed in or out meanwhile");
      return keep(answer);
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  function reportLost() {
    if (lostReported) return;
    lostReported = true;
    onSessionLost();
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
        if (error instanceof ApiError && error.status === 401) reportLost();
        throw error;
      }
    }
    return send<T>(path, init);
  }

  return {
    /**
     * On launch: renews the Session this phone kept, or answers null when it kept none. Rejects as `refresh` does
     * (a 401 when the server ended the Session; a NetworkError or another ApiError when it couldn't be asked).
     */
    restore: async (): Promise<User | null> => {
      if (!(await storedRefreshToken())) return null;
      return refresh();
    },

    /**
     * Signs in with email and password. A User with Two-step verification gets no Session yet: the app can't take
     * the code until the Two-step ticket, so the answer says a code is needed and nothing is stored.
     */
    signIn: async (email: string, password: string): Promise<SignInOutcome> => {
      await settled();
      const answer = await send<AuthResponse | { twoStepRequired: true }>(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) },
        false,
      );
      if ("twoStepRequired" in answer) return { twoStepRequired: true };
      generation++;
      return { user: await keep(answer) };
    },

    /**
     * Ends this phone's Session on the server, then forgets it. If the server can't be reached, or fails, the User
     * stays signed in, as on the web: the Session would otherwise live on unseen.
     */
    signOut: async () => {
      await settled();
      const token = await storedRefreshToken();
      if (token) {
        await send<void>(
          "/api/auth/logout",
          { method: "POST", body: JSON.stringify({ refreshToken: token }) },
          false,
        );
      }
      generation++;
      lostReported = true;
      await drop();
    },

    /**
     * Forgets the Session on this phone only, for when the server can't end it. It stays in the User's Sessions list
     * until it expires or they sign it out from another device.
     */
    forget: async () => {
      await settled();
      generation++;
      lostReported = true;
      await drop();
    },

    /** Creates a User, an Unverified User until they enter their Verification code, and signs them in. */
    register: async (input: RegisterInput): Promise<User> => {
      await settled();
      const answer = await send<AuthResponse>(
        "/api/auth/register",
        { method: "POST", body: JSON.stringify(input) },
        false,
      );
      generation++;
      return keep(answer);
    },

    /**
     * Checks the Verification code and answers the User, now verified. The access token in hand says "unverified", so
     * the server would look the User up on every request until it expires: a renewed one says "verified". If renewing
     * can't be done for now the User is verified all the same, and the next renewal fixes the token; if the Session
     * has ended meanwhile (a 401), it is lost and this rejects. Also rejects with a 400 ApiError for a wrong code
     * (`invalid_code`, with `triesLeft`) or a gone one (`code_expired`).
     */
    verifyEmail: async (code: string): Promise<User> => {
      const user = await request<User>("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      try {
        return await refresh();
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) return user;
        reportLost();
        throw error;
      }
    },

    /** Mails a new Verification code. A 429 says how long to wait; a 409, that the email is verified already. */
    resendVerificationCode: () =>
      request<void>("/api/auth/verify-email/resend", { method: "POST" }),

    /** Renews the Session to read the User again, as when their email was verified on another device. */
    reload: () => refresh(),

    /** Emails a Reset code if a User has the address; the answer is the same either way. */
    requestPasswordReset: (email: string) =>
      send<void>(
        "/api/auth/password-reset",
        { method: "POST", body: JSON.stringify({ email }) },
        false,
      ),

    /** Sets a new password with a right Reset code. Signs no one in: every Session of the User ends. */
    resetPassword: (input: ResetPasswordInput) =>
      send<void>(
        "/api/auth/password-reset/confirm",
        { method: "POST", body: JSON.stringify(input) },
        false,
      ),

    me: () => request<User>("/api/users/me"),
  };
}

export type MobileApi = ReturnType<typeof createMobileApi>;
