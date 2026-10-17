import { describe, expect, it } from "vitest";
import { followsName, keyForName } from "./roleKey";

describe("keyForName", () => {
  it("fills an empty key from the name", () => {
    expect(keyForName("", "QA lead", "")).toBe("qa_lead");
  });

  it("keeps following the name while the key is still the suggestion", () => {
    expect(keyForName("QA lea", "QA lead", "qa_lea")).toBe("qa_lead");
  });

  it("leaves a key the User chose alone", () => {
    expect(keyForName("QA lea", "QA lead", "tester")).toBe("tester");
  });

  it("clears a following key when the name is cleared", () => {
    expect(keyForName("QA lead", "", "qa_lead")).toBe("");
  });

  it("follows again once the User types the suggestion back", () => {
    // The key was "tester"; the User changed it back to what the name suggests.
    expect(keyForName("QA lead", "QA leads", "qa_lead")).toBe("qa_leads");
  });
});

describe("followsName", () => {
  it("is true while the key is the one the name suggests", () => {
    expect(followsName("QA lead", "qa_lead")).toBe(true);
  });

  it("is false for a key the User chose, or when there is no key yet", () => {
    expect(followsName("QA lead", "tester")).toBe(false);
    expect(followsName("", "")).toBe(false);
  });
});
