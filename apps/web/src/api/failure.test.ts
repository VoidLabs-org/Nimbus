import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "./client";
import { failedLoad } from "./failure";

describe("failedLoad", () => {
  it("shows the not-found page for a 404", () => {
    expect(failedLoad(new ApiError(404, "No Role has this key."))).toBe("not-found");
  });

  it("shows the no-access page for a 403", () => {
    expect(failedLoad(new ApiError(403, undefined))).toBe("no-access");
  });

  it("shows the offline page when the request never reached the server", () => {
    expect(failedLoad(new NetworkError(new TypeError("Failed to fetch")))).toBe("offline");
  });

  it("shows the server-error page for anything else, a bug in the app included", () => {
    expect(failedLoad(new ApiError(500, undefined))).toBe("server");
    expect(failedLoad(new ApiError(502, undefined))).toBe("server");
    expect(failedLoad(new ApiError(429, undefined, {}, 30))).toBe("server");
    expect(failedLoad(new TypeError("Cannot read properties of undefined"))).toBe("server");
  });
});
