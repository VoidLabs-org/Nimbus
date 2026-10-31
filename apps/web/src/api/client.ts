import { ApiError, apiErrorFrom, EMAIL_UNVERIFIED, NetworkError } from "@repo/api";
import type { components } from "@repo/api/schema";
import { sessionExpiredPath } from "../auth/returnPath";

// What the API sends and takes, from the contract (docs/specs/openapi.yaml) through @repo/api's generated types, so a
// contract change that breaks the web app fails type-checking here.
type Schemas = components["schemas"];

export type User = Schemas["User"];

export type PictureSource = NonNullable<User["pictureSource"]>;

export type PictureOptions = User["pictureOptions"];

export type RegisterInput = Schemas["RegisterRequest"];

export type Project = Schemas["Project"];

export type CreateProjectInput = Schemas["CreateProjectRequest"];

export type ChangePasswordInput = Schemas["ChangePasswordRequest"];

export type LoginInput = Schemas["LoginRequest"];

export type NotificationItem = Schemas["NotificationItem"];

export type NotificationPage = Schemas["NotificationPage"];

export type IssueNotificationType = Schemas["IssueNotificationType"];

export type NotificationSetting = Schemas["NotificationSetting"];

/** A User with Two-step verification also sends a Sign-in code or a Recovery code (`two_step_required`). */
export type ResetPasswordInput = {
  email: string;
  code: string;
  newPassword: string;
  twoStepCode?: string;
  recoveryCode?: string;
};

/** Where a Role is held and where a Permission applies: across Nimbus, or inside one project. */
export type Kind = "platform" | "project";

export type Scope = "own" | "project" | "all";

export type CatalogPermission = Schemas["CatalogPermission"];

export type RoleSummary = Schemas["RoleSummary"];

export type Grant = Schemas["Grant"];

export type RoleGrant = Role["grants"][number];

export type Role = Schemas["Role"];

export type RoleHolder = Schemas["RoleHolder"];

export type NewRoleInput = Schemas["CreateRoleRequest"];

/** One change in the audit log. `action` stays open: an action newer than this app shows as its own name. */
export type AuditEntry = Omit<Schemas["AuditEntry"], "action"> & { action: string };

export type AuditPage = {
  entries: AuditEntry[];
  page: number;
  size: number;
  total: number;
  /** The newest entry this set of pages covers; pass it back for the next pages so they don't shift. */
  asOf: number;
};

export type SessionInfo = Schemas["SessionInfo"];

export type LinkedIdentity = Schemas["LinkedIdentityInfo"];

export type TwoStepStatus = Schemas["TwoStepStatus"];

/** What finishes a pending sign-in: a Sign-in code, or one of the User's Recovery codes when they lost their phone. */
export type TwoStepAnswer = { code: string } | { recoveryCode: string };

/** "Confirm it's you": the password, and with Two-step verification a Sign-in code or a Recovery code. */
export type ConfirmAnswer =
  | { password: string }
  | { password: string; twoStepCode: string }
  | { password: string; recoveryCode: string };

/** A setup in progress: the key for the authenticator app, as text and as what the QR code holds. */
export type TwoStepSetup = { key: string; otpauthUri: string };

type AuthResponse = { accessToken: string; user: User };

/** The answer to a right password when the User has Two-step verification: no Session yet. */
type TwoStepRequired = { twoStepRequired: true };

/** For the calls that always start a session: an answer without one is a server bug, not a signed-in User. */
function sessionStarted(user: User | null): User {
  if (!user) throw new Error("The server started no session");
  return user;
}

export type ApiClientOptions = {
  /**
   * Called with the session-expired page's path (remembering the current page, to come back to after signing in
   * again) when the session can't be renewed.
   */
  onSessionLost?: (sessionExpiredPath: string) => void;
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
  const emailUnverifiedListeners = new Set<() => void>();

  async function send<T>(path: string, init: RequestInit, authenticated: boolean): Promise<T> {
    const headers = new Headers(init.headers);
    // A form sets its own multipart type, with the boundary.
    if (init.body !== undefined && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    if (authenticated && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

    let response: Response;
    try {
      response = await fetchFn(path, { ...init, headers });
    } catch (failure) {
      throw new NetworkError(failure);
    }
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = apiErrorFrom(response.status, body, response.headers.get("Retry-After"));
      if (error.status === 403 && error.code === EMAIL_UNVERIFIED) {
        emailUnverifiedListeners.forEach((listener) => listener());
      }
      throw error;
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
        onSessionLost(sessionExpiredPath(currentPath()));
      }
      throw error;
    }
  }

  // Waits for a refresh under way, so it can't answer after this and replace the new session. Resolves to null when
  // the server started none because a Sign-in code is still needed.
  function startSession(path: string, input: object, headers?: HeadersInit): Promise<User | null> {
    return inFlight(
      (async () => {
        await refreshing?.catch(() => {});
        const answer = await request<AuthResponse | TwoStepRequired>(
          path,
          { method: "POST", body: JSON.stringify(input), headers },
          { authenticated: false },
        );
        if (!("accessToken" in answer)) return null;
        accessToken = answer.accessToken;
        lostReported = false;
        credentialChanges++;
        return answer.user;
      })(),
    );
  }

  return {
    /** Renews the session from the refresh cookie, e.g. on app load. Rejects when there is none. */
    refresh,

    /**
     * Calls `listener` whenever the server refuses a request because the signed-in User hasn't verified their
     * email, so the app can show the verification screen wherever it happens. Returns a function that stops it.
     */
    onEmailUnverified: (listener: () => void) => {
      emailUnverifiedListeners.add(listener);
      return () => {
        emailUnverifiedListeners.delete(listener);
      };
    },

    /**
     * Checks the code the User typed and returns the User, now verified. A 400 says the code is wrong
     * (`code` "invalid_code", with `triesLeft`) or that a new one is needed ("code_expired").
     */
    verifyEmail: async (code: string) => {
      const user = await request<User>("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      // The access token in hand was issued before the User verified, so the server would keep looking the User up
      // on every request until it expires. A renewed one says "verified". If renewing fails the User is verified
      // all the same, and the next refresh fixes the token.
      await refresh().catch(() => {});
      return user;
    },

    /**
     * Mails a new Verification code, which replaces the old one. A 429 means the address was mailed too recently
     * or too often; `retryAfterSeconds` says how long to wait.
     */
    resendVerificationCode: async () => {
      await request<void>("/api/auth/verify-email/resend", { method: "POST" });
    },

    /**
     * Emails a Reset code to the address, if a User has it. Answers the same either way, so it never says
     * whether the address is registered. Public, so no access token goes along. A 429 means too many requests;
     * `retryAfterSeconds` says how long to wait.
     */
    requestPasswordReset: async (email: string) => {
      await request<void>(
        "/api/auth/password-reset",
        { method: "POST", body: JSON.stringify({ email }) },
        { authenticated: false },
      );
    },

    /**
     * Sets a new password when the Reset code is right; the User is not signed in and signs in with it. A 400
     * says the code is wrong (`code` "invalid_code", with `triesLeft`), that a new one is needed
     * ("code_expired"), or that the password breaks the rule (`fieldErrors.newPassword`).
     */
    resetPassword: async (input: ResetPasswordInput) => {
      await request<void>(
        "/api/auth/password-reset/confirm",
        { method: "POST", body: JSON.stringify(input) },
        { authenticated: false },
      );
    },

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
    register: (input: RegisterInput) =>
      startSession("/api/auth/register", input).then(sessionStarted),

    /**
     * Signs in with email and password. Whoever was signed in stays so if it fails. Resolves to null for a User with
     * Two-step verification: the server keeps the sign-in pending, and {@link signInWithCode} finishes it.
     */
    login: (input: LoginInput) => startSession("/api/auth/login", input),

    /**
     * Finishes a pending sign-in with a Sign-in code from the User's authenticator app, or a Recovery code. Rejects
     * with an ApiError: "invalid_code" with `triesLeft` (a used Recovery code too), 401 "sign_in_expired" when the
     * pending sign-in is over, or 429 with `retryAfterSeconds` while the User is locked out of code checks.
     * `rememberBrowser` is "Don't ask again on this device for 30 days": the server then sets a cookie that lets
     * this browser's next sign-ins skip the code.
     */
    signInWithCode: (answer: TwoStepAnswer, rememberBrowser = false) =>
      startSession(
        "/api/auth/two-step",
        { ...answer, rememberBrowser },
        { "X-Requested-With": "nimbus" },
      ).then(sessionStarted),

    me: () => request<User>("/api/users/me"),

    /** The projects the signed-in User is a Member of, active ones only, sorted by name by the server. */
    projects: () => request<Project[]>("/api/projects"),

    /** Creates a project and adds the signed-in User as its first Member. */
    createProject: (input: CreateProjectInput) =>
      request<Project>("/api/projects", { method: "POST", body: JSON.stringify(input) }),

    /** Opens a project by key. Unknown and non-Member projects both return 404. */
    project: (key: string) => request<Project>(`/api/projects/${encodeURIComponent(key)}`),

    /**
     * The ids of the "Continue with ..." providers the server has switched on, in the order to show them
     * (empty when none). Public, so no access token goes along; a failure says nothing about the session.
     */
    providers: () =>
      request<{ providers: string[] }>("/api/auth/providers", {}, { authenticated: false }).then(
        (response) => response.providers,
      ),

    /** Changes the display name and returns the updated User. */
    updateProfile: (input: { displayName: string }) =>
      request<User>("/api/users/me", { method: "PATCH", body: JSON.stringify(input) }),

    /**
     * Mails a Verification code to the new address, replacing any pending change; Resend is the same call. Rejects
     * with an ApiError: 400 "same_email" or `fieldErrors.email`, 409 "email_taken", 403 "reauth_required" when the
     * sign-in is too old, or 429 with `retryAfterSeconds` when the address was sent codes too fast.
     */
    requestEmailChange: async (email: string) => {
      await request<void>("/api/users/me/email-change", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },

    /**
     * "Confirm it's you" for a sign-in too old to change the email: the password, and with Two-step verification a
     * Sign-in code or a Recovery code. Rejects with an ApiError: `fieldErrors.password`, "two_step_required",
     * "invalid_two_step_code", 409 "no_password" (sign in again instead), or 429 with `retryAfterSeconds`.
     */
    confirmItsYou: async (answer: ConfirmAnswer) => {
      await request<void>("/api/users/me/confirm", {
        method: "POST",
        body: JSON.stringify(answer),
      });
    },

    /**
     * Uploads `picture` as the signed-in User's Profile picture and shows it; returns the User, whose `avatarUrl` is its
     * new address. A 400 says why it was refused: `code` "file_too_large", "unsupported_type" or "unreadable_image"; a 429
     * means 10 uploads in the last hour, and `retryAfterSeconds` says how long to wait.
     */
    uploadProfilePicture: (picture: Blob) => {
      const form = new FormData();
      form.append("file", picture, "profile-picture.jpg");
      return request<User>("/api/users/me/profile-picture", { method: "PUT", body: form });
    },

    /**
     * Sets what the signed-in User's Profile picture shows and returns the User. 400 `source_unavailable` when they
     * have no such upload, the provider isn't connected, or it sent no picture.
     */
    chooseProfilePictureSource: (source: PictureSource) =>
      request<User>("/api/users/me/profile-picture/source", {
        method: "PUT",
        body: JSON.stringify({ source }),
      }),

    /**
     * Removes the signed-in User's uploaded Profile picture (also fine without one). Read the User again for what
     * they show now.
     */
    removeProfilePicture: () =>
      request<void>("/api/users/me/profile-picture", { method: "DELETE" }),

    /**
     * Changes the email to the pending address and returns the updated User. Rejects with an ApiError:
     * "invalid_code" with `triesLeft`, "code_expired", or 409 "email_taken" when someone took the address meanwhile.
     */
    confirmEmailChange: (code: string) =>
      request<User>("/api/users/me/email-change/confirm", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),

    /**
     * Sets the signed-in User's first password, or changes it (the current one is then required). The
     * server ends their other sessions; this one stays.
     */
    changePassword: (input: ChangePasswordInput) =>
      request<void>("/api/users/me/password", { method: "PUT", body: JSON.stringify(input) }),

    /** The signed-in User's platform permissions, so the app can hide what they can't use. */
    myPlatformPermissions: () =>
      request<{ platform: string[] }>("/api/access/me/permissions").then(
        (response) => response.platform,
      ),

    /** Every Permission in the catalog, sorted by heading and key. Needs access:role:manage. */
    permissionCatalog: () =>
      request<{ permissions: CatalogPermission[] }>("/api/access/permissions").then(
        (response) => response.permissions,
      ),

    /** Every Role, platform roles first. Needs access:role:manage. */
    roles: () =>
      request<{ roles: RoleSummary[] }>("/api/access/roles").then((response) => response.roles),

    /** One Role with its Grants. Needs access:role:manage. */
    role: (key: string) => request<Role>(rolePath(key)),

    /** Creates a custom Role with no Grants. A taken key is a 409 with errors.key. */
    createRole: (input: NewRoleInput) =>
      request<Role>("/api/access/roles", { method: "POST", body: JSON.stringify(input) }),

    /** Renames or redescribes a Role. A 409 means it changed since `version` (or it is locked). */
    describeRole: (key: string, input: { name?: string; description?: string; version: number }) =>
      request<Role>(rolePath(key), { method: "PATCH", body: JSON.stringify(input) }),

    /** Replaces all of a Role's Grants. A 400 lists what is wrong per Permission; a 409 means it changed. */
    saveGrants: (key: string, input: { grants: Grant[]; version: number }) =>
      request<Role>(`${rolePath(key)}/grants`, { method: "PUT", body: JSON.stringify(input) }),

    /** Back to the defaults; built-in Roles only. */
    resetRole: (key: string, version: number) =>
      request<Role>(`${rolePath(key)}/reset`, {
        method: "POST",
        body: JSON.stringify({ version }),
      }),

    /** The User's running sign-ins, this browser's first. */
    sessions: () => request<SessionInfo[]>("/api/users/me/sessions"),

    notifications: (before?: string) =>
      request<NotificationPage>(
        `/api/notifications${before ? `?before=${encodeURIComponent(before)}` : ""}`,
      ),
    notificationUnreadCount: () => request<{ count: number }>("/api/notifications/unread-count"),
    readNotification: (id: string) =>
      request<void>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
    readAllNotifications: () => request<void>("/api/notifications/read-all", { method: "POST" }),
    notificationSettings: () =>
      request<NotificationSetting[]>("/api/users/me/notification-settings"),
    saveNotificationSetting: (type: IssueNotificationType, email: boolean) =>
      request<void>(`/api/users/me/notification-settings/${type}`, {
        method: "PUT",
        body: JSON.stringify({ email }),
      }),
    /** Ends every session of the User except this one; 204 even when there are none. */
    endOtherSessions: () =>
      request<void>("/api/users/me/sessions/sign-out-others", { method: "POST" }),
    /** Ends another of the User's sessions at once; no password needed. 404 when it is not theirs or never existed. */
    endSession: (id: string) =>
      request<void>(`/api/users/me/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),

    /** The Google and GitHub accounts connected to the User, Google first. */
    linkedIdentities: () => request<LinkedIdentity[]>("/api/users/me/linked-identities"),

    /** Stops a provider signing in as the User; 204 also when it wasn't connected. 409 `last_sign_in_method` if it is their only way in. */
    disconnectProvider: (provider: string) =>
      request<void>(`/api/users/me/linked-identities/${encodeURIComponent(provider)}`, {
        method: "DELETE",
      }),

    /**
     * A one-time ticket for starting to connect a provider with a full page load to
     * `/api/auth/oauth2/<provider>?link=<ticket>`. 403 `reauth_required` when this sign-in is too old.
     */
    linkTicket: (provider: string) =>
      request<{ ticket: string }>(
        `/api/users/me/linked-identities/${encodeURIComponent(provider)}/link-ticket`,
        { method: "POST" },
      ),

    /**
     * Desktop app: trades the one-time code a sign-in in the system browser handed back, and the app's verifier, for
     * the sign-in (ADR 0008). The server sets the refresh cookie (the app then loads `/auth/callback`) or, with
     * `twoStepRequired`, the pending sign-in's cookie for `/login/two-step`. Rejects with an ApiError whose `code` is
     * what the sign-in page shows: "expired", "email_unverified" or "disconnected".
     */
    desktopExchange: (code: string, verifier: string) =>
      request<{ twoStepRequired: boolean }>(
        "/api/auth/desktop/exchange",
        {
          method: "POST",
          body: JSON.stringify({ code, verifier }),
          headers: { "X-Requested-With": "nimbus" },
        },
        { authenticated: false },
      ),

    /**
     * Desktop app: connects the provider a connect in the system browser came back from, with its code and verifier.
     * Rejects with an ApiError whose `code` is what the Security page shows: "expired", "email_unverified",
     * "already_linked" or "already_connected".
     */
    desktopConnect: (code: string, verifier: string) =>
      request<{ provider: string }>("/api/auth/desktop/connect", {
        method: "POST",
        body: JSON.stringify({ code, verifier }),
      }),

    /** Whether the User has Two-step verification, since when, and how many Recovery codes are left. */
    twoStep: () => request<TwoStepStatus>("/api/users/me/two-step"),

    /**
     * Starts setting up Two-step verification with a new key, replacing any setup in progress. 403
     * `reauth_required` when this sign-in is too old; 409 `already_on`.
     */
    startTwoStepSetup: () =>
      request<TwoStepSetup>("/api/users/me/two-step/setup", { method: "POST" }),

    /** Proves the app has the key with a Sign-in code; answers with the Recovery codes to save. 400 `invalid_code`, 409 `setup_expired`. */
    verifyTwoStepSetup: (code: string) =>
      request<{ recoveryCodes: string[] }>("/api/users/me/two-step/setup/verify", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),

    /** Throws away this sign-in's setup in progress, because the User closed the window; 204 also when there is none. */
    discardTwoStepSetup: () => request<void>("/api/users/me/two-step/setup", { method: "DELETE" }),

    /** Turns Two-step verification on with the setup just proved. 409 `setup_expired` or `already_on`. */
    turnOnTwoStep: () => request<void>("/api/users/me/two-step", { method: "POST" }),

    /**
     * View new codes: a Sign-in code from the app replaces the Recovery codes, and the old set stops working. 400
     * `invalid_code`, 409 `not_on`, 429 with `retryAfterSeconds` while the User is locked out of code checks.
     */
    newRecoveryCodes: (code: string) =>
      request<{ recoveryCodes: string[] }>("/api/users/me/two-step/recovery-codes", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),

    /**
     * Remove: a Sign-in code, or a Recovery code, turns Two-step verification off and deletes the key and the
     * Recovery codes. 400 `invalid_code`, 409 `not_on`, 429 with `retryAfterSeconds` while the User is locked out of
     * code checks.
     */
    turnOffTwoStep: (answer: TwoStepAnswer) =>
      request<void>("/api/users/me/two-step", { method: "DELETE", body: JSON.stringify(answer) }),

    /** The audit log, newest first. Needs access:audit:view. */
    auditLog: (page: number, size: number, asOf?: number) =>
      request<AuditPage>(
        `/api/access/audit?page=${page}&size=${size}${asOf === undefined ? "" : `&asOf=${asOf}`}`,
      ),

    /** Deletes a custom Role nobody holds; a 409 says why not otherwise. */
    deleteRole: (key: string) => request<void>(rolePath(key), { method: "DELETE" }),

    /** The Users holding a platform role. Needs access:role:assign; 409 for Everyone and project roles. */
    roleHolders: (key: string) =>
      request<{ users: RoleHolder[] }>(`${rolePath(key)}/users`).then((response) => response.users),

    /**
     * Gives a platform role to the User with this email. 404 if nobody has it, 409 if they already hold the
     * Role, 403 for the signed-in User's own email.
     */
    giveRole: (key: string, email: string) =>
      request<RoleHolder>(`${rolePath(key)}/users`, {
        method: "POST",
        body: JSON.stringify({ email }),
      }),

    /** Takes a platform role away. 409 for the last Platform admin, 403 for the signed-in User. */
    takeRole: (key: string, userId: string) =>
      request<void>(`${rolePath(key)}/users/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  };
}

function rolePath(key: string): string {
  return `/api/access/roles/${encodeURIComponent(key)}`;
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const api = createApiClient((input, init) => fetch(input, init));
