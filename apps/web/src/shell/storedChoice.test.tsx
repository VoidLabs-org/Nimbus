// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { storedChoice } from "./storedChoice";

type Fruit = "apple" | "pear";
const parse = (raw: string | null): Fruit => (raw === "pear" ? "pear" : "apple");

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("storedChoice", () => {
  it("reads the stored choice, the default when there is none", () => {
    const fruit = storedChoice("test-fruit", parse, "apple");
    expect(fruit.read()).toBe("apple");
    fruit.write("pear");
    expect(localStorage.getItem("test-fruit")).toBe("pear");
    expect(fruit.read()).toBe("pear");
  });

  it("changes every component reading it at once, and follows another window", () => {
    const fruit = storedChoice("test-fruit", parse, "apple");
    function Shown({ label }: { label: string }) {
      const [value, setValue] = fruit.useChoice();
      return (
        <button type="button" onClick={() => setValue("pear")}>
          {label}: {value}
        </button>
      );
    }
    render(
      <>
        <Shown label="a" />
        <Shown label="b" />
      </>,
    );

    act(() => screen.getByText("a: apple").click());
    expect(screen.getByText("b: pear")).toBeTruthy();

    // Another window stores a choice.
    localStorage.setItem("test-fruit", "apple");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "test-fruit" }));
    });
    expect(screen.getByText("a: apple")).toBeTruthy();
    expect(screen.getByText("b: apple")).toBeTruthy();
  });
});
