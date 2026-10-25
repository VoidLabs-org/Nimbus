import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { resolveWebFile } from "./static-files.js";

const DIST = path.resolve("/srv/nimbus/web/dist");

describe("resolveWebFile", () => {
  it("serves a file by its path", () => {
    assert.deepEqual(resolveWebFile(DIST, "/assets/index-abc.js"), {
      file: path.join(DIST, "assets", "index-abc.js"),
    });
    assert.deepEqual(resolveWebFile(DIST, "/favicon.svg"), {
      file: path.join(DIST, "favicon.svg"),
    });
  });

  it("gives index.html for a page route, which has no file extension", () => {
    for (const route of ["/", "/settings/profile", "/projects/NW", "/login"]) {
      assert.deepEqual(resolveWebFile(DIST, route), { file: path.join(DIST, "index.html") }, route);
    }
  });

  it("refuses a path that climbs out of the folder", () => {
    for (const route of [
      "/../secret.txt",
      "/assets/../../secret.txt",
      "/%2e%2e/secret.txt",
      "/..%2f..%2fsecret.txt",
    ]) {
      assert.deepEqual(resolveWebFile(DIST, route), { error: "Bad request" }, route);
    }
  });

  it("refuses an address that can't be decoded", () => {
    assert.deepEqual(resolveWebFile(DIST, "/%E0%A4%A"), { error: "Bad request" });
  });
});
