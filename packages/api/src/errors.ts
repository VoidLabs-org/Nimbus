/** The `code` the server puts on the 403 it answers an Unverified User with. */
export const EMAIL_UNVERIFIED = "email_unverified";

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

/**
 * The ApiError for a response that wasn't OK: its status, the problem details in its JSON body (undefined when the
 * body wasn't JSON) and its Retry-After header (null when it sent none). A field of the wrong kind, as a proxy's own
 * error page might send, counts as missing.
 */
export function apiErrorFrom(
  status: number,
  body: unknown,
  retryAfterHeader: string | null,
): ApiError {
  const problem: Record<string, unknown> = isObject(body) ? body : {};
  const retryAfter = Number(retryAfterHeader);
  return new ApiError(
    status,
    typeof problem.detail === "string" ? problem.detail : undefined,
    fieldErrors(problem.errors),
    retryAfter > 0 ? retryAfter : null,
    typeof problem.code === "string" ? problem.code : null,
    typeof problem.triesLeft === "number" ? problem.triesLeft : null,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The problem's `errors`, one message per field; anything that isn't text is left out. */
function fieldErrors(errors: unknown): Record<string, string> {
  if (!isObject(errors)) return {};
  return Object.fromEntries(
    Object.entries(errors).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
