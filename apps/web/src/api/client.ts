export type User = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

export type RegisterInput = { displayName: string; email: string; password: string };

type AuthResponse = { accessToken: string; user: User };

/** A failed API call, carrying the server's problem details (RFC 9457). */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: Record<string, string>;

  constructor(
    status: number,
    detail: string | undefined,
    fieldErrors: Record<string, string> = {},
  ) {
    super(detail ?? `Request failed with status ${status}`);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Talks to the Nimbus API. The access token lives only in this closure (memory), never in browser
 * storage, so injected scripts can't read it back after a reload.
 */
export function createApiClient(fetchFn: typeof fetch = fetch) {
  let accessToken: string | null = null;

  // Public endpoints go without the token: the server rejects an expired one even where none is needed.
  async function request<T>(
    path: string,
    init: RequestInit = {},
    { authenticated = true } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    if (authenticated && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

    const response = await fetchFn(path, { ...init, headers });
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new ApiError(response.status, body?.detail, body?.errors);
    }
    return body as T;
  }

  return {
    /** Creates a User and signs them in. Whoever was signed in stays so if it fails. */
    async register(input: RegisterInput): Promise<User> {
      const { accessToken: token, user } = await request<AuthResponse>(
        "/api/auth/register",
        { method: "POST", body: JSON.stringify(input) },
        { authenticated: false },
      );
      accessToken = token;
      return user;
    },

    me: () => request<User>("/api/users/me"),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

export const api = createApiClient((input, init) => fetch(input, init));
