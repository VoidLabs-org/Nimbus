import { sessionExpiredPath } from "../auth/returnPath";

export type User = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  /** False for Users who only sign in with Google or GitHub; they set a password without giving a current one. */
  hasPassword: boolean;
  /** False until the User enters the code emailed to them; until then the app shows only the verification screen. */
  emailVerified: boolean;
};

export type RegisterInput = { displayName: string; email: string; password: string };

export type ChangePasswordInput = {
  /** Required when the User has a password. */
  currentPassword?: string;
  newPassword: string;
};

export type LoginInput = { email: string; password: string };

export type ResetPasswordInput = { email: string; code: string; newPassword: string };

/** Where a Role is held and where a Permission applies: across Nimbus, or inside one project. */
export type Kind = "platform" | "project";

export type Scope = "own" | "project" | "all";

/** One Permission in the catalog, as the Roles pages show it. */
export type CatalogPermission = {
  key: string;
  /** The module heading it is grouped under, e.g. "Projects". */
  heading: string;
  description: string;
  kind: Kind;
  /** The Scopes it may have in project roles; empty for platform permissions. */
  scopes: Scope[];
  /** What Scope Own means for it; null when Own isn't allowed. */
  ownHint: string | null;
  /** Only Platform admin may hold it. */
  reserved: boolean;
};

export type RoleSummary = {
  key: string;
  name: string;
  description: string;
  kind: Kind;
  builtIn: boolean;
  customised: boolean;
  /** How many Permissions it grants. */
  permissions: number;
  /** How many Users hold it; null for Everyone, which every signed-in User holds. */
  holders: number | null;
};

export type Grant = {
  permission: string;
  /** Null for platform permissions. */
  scope: Scope | null;
};

export type RoleGrant = Grant & {
  /** The Role must always hold it. */
  locked: boolean;
};

export type Role = Omit<RoleSummary, "permissions"> & {
  /** Changes on every edit; edits send the version they started from. */
  version: number;
  /** Nothing about it can be edited (Platform admin). */
  locked: boolean;
  grants: RoleGrant[];
  /** For a customised built-in Role: defaults it lacks that appeared after it was customised. */
  newPermissions: string[];
};

/** A User holding a platform role. */
export type RoleHolder = {
  id: string;
  /** Null, like the name, for a User who no longer exists. */
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** When they were given the Role (ISO 8601). */
  since: string;
};

export type NewRoleInput = { key: string; name: string; description: string; kind: Kind };

/** One change in the audit log. */
export type AuditEntry = {
  id: string;
  /** When it happened (ISO 8601). */
  at: string;
  /** Who did it; null when the system did (e.g. a warning at startup). Name and email are null for a User who no longer exists. */
  actor: {
    id: string;
    displayName: string | null;
    email: string | null;
    avatarUrl: string | null;
  } | null;
  /** e.g. role.created, role.renamed, role.grants_changed, role.reset, role.deleted, role.assigned, role.unassigned, catalog.unknown_grant */
  action: string;
  /** `exists` is false once the Role has been deleted. */
  target: { type: string; key: string; exists: boolean };
  /** The state before; null when there was none (created). */
  before: Record<string, unknown> | null;
  /** The state after; null when there is none (deleted). */
  after: Record<string, unknown> | null;
};

export type AuditPage = {
  entries: AuditEntry[];
  page: number;
  size: number;
  total: number;
  /** The newest entry this set of pages covers; pass it back for the next pages so they don't shift. */
  asOf: number;
};

/** The `code` the server puts on the 403 it answers an Unverified User with. */
export const EMAIL_UNVERIFIED = "email_unverified";

type AuthResponse = { accessToken: string; user: User };

/** A failed API call, carrying the server's problem details (RFC 9457). */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string>;
  /** From Retry-After on a 429: how long until another attempt may succeed. */
  readonly retryAfterSeconds: number | null;
  /** The server's machine-readable reason, e.g. "email_unverified" or "invalid_code"; null when it sent none. */
  readonly code: string | null;
  /** On an "invalid_code": how many wrong tries the Verification code has left. */
  readonly triesLeft: number | null;

  constructor(
    status: number,
    detail: string | undefined,
    fieldErrors: Record<string, string> = {},
    retryAfterSeconds: number | null = null,
    code: string | null = null,
    triesLeft: number | null = null,
  ) {
    super(detail ?? `Request failed with status ${status}`);
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.retryAfterSeconds = retryAfterSeconds;
    this.code = code;
    this.triesLeft = triesLeft;
  }
}

/** A request that never reached the server: no network, or the server can't be found. Carries fetch's own error. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("The request couldn't reach the server", { cause });
    this.name = "NetworkError";
  }
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
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    if (authenticated && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

    let response: Response;
    try {
      response = await fetchFn(path, { ...init, headers });
    } catch (failure) {
      throw new NetworkError(failure);
    }
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const error = new ApiError(
        response.status,
        body?.detail,
        body?.errors,
        retryAfter > 0 ? retryAfter : null,
        typeof body?.code === "string" ? body.code : null,
        typeof body?.triesLeft === "number" ? body.triesLeft : null,
      );
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
    register: (input: RegisterInput) => startSession("/api/auth/register", input),

    /** Signs in with email and password. Whoever was signed in stays so if it fails. */
    login: (input: LoginInput) => startSession("/api/auth/login", input),

    me: () => request<User>("/api/users/me"),

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
