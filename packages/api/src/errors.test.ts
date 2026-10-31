import { describe, expect, it } from "vitest";
import { apiErrorFrom } from "./errors";

describe("apiErrorFrom", () => {
  it("reads the server's problem details", () => {
    const error = apiErrorFrom(
      400,
      {
        detail: "That code didn't work.",
        errors: { code: "Must be 6 digits" },
        code: "invalid_code",
        triesLeft: 3,
      },
      null,
    );

    expect(error.status).toBe(400);
    expect(error.message).toBe("That code didn't work.");
    expect(error.fieldErrors).toEqual({ code: "Must be 6 digits" });
    expect(error.code).toBe("invalid_code");
    expect(error.triesLeft).toBe(3);
    expect(error.retryAfterSeconds).toBeNull();
  });

  it("names the status when the body isn't JSON", () => {
    const error = apiErrorFrom(502, undefined, null);

    expect(error.message).toBe("Request failed with status 502");
    expect(error.fieldErrors).toEqual({});
    expect(error.code).toBeNull();
    expect(error.triesLeft).toBeNull();
  });

  it("takes a wait in seconds from Retry-After, and nothing else", () => {
    expect(apiErrorFrom(429, {}, "42").retryAfterSeconds).toBe(42);
    expect(apiErrorFrom(429, {}, "0").retryAfterSeconds).toBeNull();
    expect(apiErrorFrom(429, {}, "Wed, 21 Oct 2026 07:28:00 GMT").retryAfterSeconds).toBeNull();
  });

  it("ignores problem fields of the wrong kind, as a proxy's error page might send", () => {
    const error = apiErrorFrom(
      502,
      { detail: { msg: "upstream" }, errors: ["a"], code: 7, triesLeft: "3" },
      null,
    );

    expect(error.message).toBe("Request failed with status 502");
    expect(error.fieldErrors).toEqual({});
    expect(error.code).toBeNull();
    expect(error.triesLeft).toBeNull();
  });

  it("keeps only the field errors that are text", () => {
    const error = apiErrorFrom(400, { errors: { email: "Taken", name: 3 } }, null);

    expect(error.fieldErrors).toEqual({ email: "Taken" });
  });
});
