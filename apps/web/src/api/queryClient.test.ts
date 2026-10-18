import { describe, expect, it } from "vitest";
import { createQueryClient } from "./queryClient";

describe("the app's query client", () => {
  it("sends changes at once even when the browser reports offline, so a failure is shown", () => {
    expect(createQueryClient().getDefaultOptions().mutations?.networkMode).toBe("always");
  });
});
