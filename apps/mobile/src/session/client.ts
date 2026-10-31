import { ApiError, apiErrorFrom, NetworkError } from "@repo/api";
import type { components, paths } from "@repo/api/schema";

export type User = components["schemas"]["User"];
export type RegisterInput = components["schemas"]["RegisterRequest"];
export type PictureSource = NonNullable<User["pictureSource"]>;

/** A photo on the phone, as the image picker hands it over, to upload. */
export type PhotoFile = { uri: string; name: string; type: string };

/** "Confirm it's you": the password, and with Two-step verification a Sign-in code or a Recovery code. */
export type ConfirmAnswer =
  | { password: string }
  | { password: string; twoStepCode: string }
  | { password: string; recoveryCode: string };
/** A Reset code and the new password, and with Two-step verification a Sign-in code or a Recovery code. */
export type ResetPasswordInput = {
  email: string;
  code: string;
  newPassword: string;
  twoStepCode?: string;
  recoveryCode?: string;
};

/** Where the refresh token is kept between launches: the phone's secure storage (ADR 0010). */
export type TokenStore = {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
};

/**
 * Each User's remembered device on this phone ("Remember this device for 30 days"), by the email they sign in with
 * (case ignored): the token that lets their password sign-in skip the Sign-in code. Remembering a device for a User
 * replaces any entry they had under another email, as after changing it.
 */
export type RememberedDevices = {
  get(email: string): Promise<string | null>;
  set(email: string, userId: string, token: string): Promise<void>;
  forget(email: string): Promise<void>;
  /** Forgets the User's entry, whichever email it is under. */
  forgetUser(userId: string): Promise<void>;
  /** Every User's token, for a provider sign-in, which can't know beforehand whom it signs in as. */
  all(): Promise<string[]>;
};

type AuthResponse = components["schemas"]["AuthResponse"];
type LoginAnswer =
  paths["/api/auth/login"]["post"]["responses"][200]["content"]["application/json"];
type ProvidersAnswer =
  paths["/api/auth/providers"]["get"]["responses"][200]["content"]["application/json"];
type ExchangeAnswer =
  paths["/api/auth/app/exchange"]["post"]["responses"][200]["content"]["application/json"];

/** What a right password led to: a Session, or (with Two-step verification) a Sign-in code still to give. */
export type SignInOutcome = { user: User } | { twoStepRequired: true };

/** The second step of a sign-in: a Sign-in code from the authenticator app, or a Recovery code. */
export type SecondCode = { code: string } | { recoveryCode: string };

export type MobileApiOptions = {
  baseUrl: string;
  store: TokenStore;
  /** Where the pending Two-step sign-in is kept until its code is right. */
  pendingStore: TokenStore;
  remembered: RememberedDevices;
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
  pendingStore,
  remembered,
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
  // The pending Two-step sign-in, from a right password until its code is right, and the email it was started with,
  // which its remembered device is kept under; the token is also in `pendingStore`.
  let pendingToken: string | null = null;
  let pendingEmail: string | null = null;

  async function send<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("X-Nimbus-Client", "mobile");
    headers.set("User-Agent", userAgent);
    headers.set("Accept", "application/json");
    // An upload's form sets its own multipart type, with the boundary.
    if (init.body !== undefined && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
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
    // With X-Nimbus-Client: mobile the server always answers it (ADR 0010).
    if (!answer.refreshToken) throw new Error("The server sent no refresh token");
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

  /** Storage that fails only costs a later step (a Sign-in code asked for again), so it doesn't stop this one. */
  async function bestEffort(what: string, write: () => Promise<void>) {
    try {
      await write();
    } catch (failure) {
      console.warn(`Couldn't ${what} in secure storage`, failure);
    }
  }

  async function endPending() {
    pendingToken = null;
    pendingEmail = null;
    await bestEffort("forget the pending sign-in", () => pendingStore.clear());
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
      // A pending sign-in left from an earlier launch can't be finished: its screen is gone, and the server's copy
      // ends after 5 minutes anyway.
      await endPending();
      if (!(await storedRefreshToken())) return null;
      return refresh();
    },

    /**
     * Signs in with email and password, sending this User's remembered device if the phone has one. A User with
     * Two-step verification gets no Session yet: the answer says a code is needed, and the pending sign-in is kept
     * for {@link finishTwoStep}. A remembered device that didn't skip the code is no longer known, so it is forgotten.
     */
    signIn: async (email: string, password: string): Promise<SignInOutcome> => {
      await settled();
      const rememberedToken = await remembered.get(email).catch(() => null);
      const answer = await send<LoginAnswer>(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            ...(rememberedToken ? { rememberedToken } : {}),
          }),
        },
        false,
      );
      if ("twoStepRequired" in answer) {
        if (rememberedToken) await bestEffort("forget the device", () => remembered.forget(email));
        const token = answer.pendingToken;
        // With X-Nimbus-Client: mobile the server always answers it (ADR 0010).
        if (!token) throw new Error("The server sent no pending sign-in");
        pendingToken = token;
        pendingEmail = email;
        await bestEffort("keep the pending sign-in", () => pendingStore.set(token));
        return { twoStepRequired: true };
      }
      generation++;
      return { user: await keep(answer) };
    },

    /** The sign-in providers the server offers ("google", "github"); public. */
    providers: () =>
      send<ProvidersAnswer>("/api/auth/providers", {}, false).then((answer) => answer.providers),

    /**
     * Trades the one-time code a provider sign-in in the in-app browser handed back, with this attempt's verifier,
     * for the sign-in: a Session, or (with Two-step verification) a pending sign-in for {@link finishTwoStep}. Sends
     * every User's remembered device, so the one the provider signs in as can skip the code. Rejects with a 400
     * ApiError whose `code` is what the sign-in page shows: `expired`, `email_unverified`, `disconnected`, `failed`.
     */
    exchange: async (code: string, verifier: string): Promise<SignInOutcome> => {
      await settled();
      const rememberedTokens = await remembered.all().catch(() => []);
      const answer = await send<ExchangeAnswer>(
        "/api/auth/app/exchange",
        { method: "POST", body: JSON.stringify({ code, verifier, rememberedTokens }) },
        false,
      );
      if ("user" in answer) {
        generation++;
        return { user: await keep(answer) };
      }
      if (!answer.twoStepRequired || !answer.pendingToken) {
        throw new Error("The server answered neither a Session nor a pending sign-in");
      }
      const token = answer.pendingToken;
      pendingToken = token;
      // Kept under the email the server answers once the code is right.
      pendingEmail = null;
      await bestEffort("keep the pending sign-in", () => pendingStore.set(token));
      return { twoStepRequired: true };
    },

    /**
     * Finishes a pending Two-step sign-in with a Sign-in code or a Recovery code and starts the Session. With
     * `rememberDevice`, the device the server remembers is kept for this User, under the email they signed in with
     * (the one the next sign-in will look it up by). Rejects with a 400 ApiError for a wrong
     * code (`invalid_code`, with `triesLeft`), a 429 while the User is over the hourly lock, and a 401
     * (`sign_in_expired`) when the pending sign-in is gone: timed out, ended by the fifth wrong code, or never there.
     */
    finishTwoStep: async (secondCode: SecondCode, rememberDevice: boolean): Promise<User> => {
      await settled();
      const token = pendingToken ?? (await pendingStore.get().catch(() => null));
      let answer: AuthResponse;
      try {
        answer = await send<AuthResponse>(
          "/api/auth/two-step",
          {
            method: "POST",
            body: JSON.stringify({
              pendingToken: token,
              ...secondCode,
              rememberBrowser: rememberDevice,
            }),
          },
          false,
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) await endPending();
        throw error;
      }
      const email = pendingEmail ?? answer.user.email;
      await endPending();
      const { rememberedToken } = answer;
      if (rememberedToken) {
        await bestEffort("remember the device", () =>
          remembered.set(email, answer.user.id, rememberedToken),
        );
      } else {
        // A code was needed, so whatever this phone kept for the User no longer skips it.
        await bestEffort("forget the device", () => remembered.forgetUser(answer.user.id));
      }
      generation++;
      return keep(answer);
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
    /** Leaves the code step: the pending sign-in is dropped here (the server's copy ends after 5 minutes). */
    cancelTwoStep: () => endPending(),

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

    /** Changes the display name and answers the User. 400 with `fieldErrors.displayName`, 429 when blocked. */
    updateDisplayName: (displayName: string) =>
      request<User>("/api/users/me", { method: "PATCH", body: JSON.stringify({ displayName }) }),

    /**
     * Uploads a photo as the User's Profile picture, which then shows; answers the User. A 400 says why it was refused
     * (`code` "file_too_large", "unsupported_type" or "unreadable_image"); a 429 means 10 uploads in the last hour.
     */
    uploadProfilePicture: (photo: PhotoFile) => {
      const form = new FormData();
      // React Native's form takes a file as its address on the phone, with a name and a type.
      form.append("file", photo as unknown as Blob);
      return request<User>("/api/users/me/profile-picture", { method: "PUT", body: form });
    },

    /** Sets what the Profile picture shows; answers the User. 400 `source_unavailable` when it isn't there. */
    choosePictureSource: (source: PictureSource) =>
      request<User>("/api/users/me/profile-picture/source", {
        method: "PUT",
        body: JSON.stringify({ source }),
      }),

    /** Removes the uploaded photo (fine without one). Read the User again for what they show now. */
    removeProfilePicture: () =>
      request<void>("/api/users/me/profile-picture", { method: "DELETE" }),

    /**
     * Mails a Verification code to the new address; Resend is the same call. 400 "same_email" or
     * `fieldErrors.email`, 409 "email_taken", 403 "reauth_required" when the sign-in is too old, 429 when the address
     * was sent codes too fast.
     */
    requestEmailChange: (email: string) =>
      request<void>("/api/users/me/email-change", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),

    /**
     * "Confirm it's you" for a sign-in too old to change the email. `fieldErrors.password`, "two_step_required",
     * "invalid_two_step_code", 409 "no_password" (sign in again instead), or 429.
     */
    confirmItsYou: (answer: ConfirmAnswer) =>
      request<void>("/api/users/me/confirm", { method: "POST", body: JSON.stringify(answer) }),

    /** Changes the email to the pending address; answers the User. "invalid_code", "code_expired", 409 "email_taken". */
    confirmEmailChange: (code: string) =>
      request<User>("/api/users/me/email-change/confirm", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
  };
}

export type MobileApi = ReturnType<typeof createMobileApi>;
