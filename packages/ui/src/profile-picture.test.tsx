import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfilePicture } from "./profile-picture";
import { stubMatchMedia } from "./test-support";

let restoreMatchMedia: () => void;

beforeEach(() => {
  restoreMatchMedia = stubMatchMedia();
});

afterEach(() => {
  cleanup();
  restoreMatchMedia();
});

function show(name: string | null, src?: string | null) {
  return render(
    <MantineProvider>
      <ProfilePicture name={name} src={src} size={36} />
    </MantineProvider>,
  );
}

/** The picture itself; Mantine also renders a style tag into the container. */
function picture(container: HTMLElement) {
  return container.querySelector(".nimbus-profile-picture")!;
}

describe("ProfilePicture", () => {
  it("shows the image when there is one", () => {
    const { container } = show("Udula Thathsaridu", "https://pictures.example.com/u.jpg");

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://pictures.example.com/u.jpg",
    );
    expect(picture(container).textContent).toBe("");
  });

  it("shows the initials when there is no image", () => {
    const { container } = show("Udula Thathsaridu", null);

    expect(container.querySelector("img")).toBeNull();
    expect(picture(container).textContent).toBe("UT");
  });

  it("falls back to the initials when the image fails to load", () => {
    const { container } = show("Udula Thathsaridu", "https://pictures.example.com/gone.jpg");

    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector("img")).toBeNull();
    expect(picture(container).textContent).toBe("UT");
  });

  it("draws System in grey", () => {
    const { container } = show(null);

    expect(picture(container).textContent).toBe("SY");
    expect(container.querySelector("[data-tone]")?.getAttribute("data-tone")).toBe("system");
  });
});
