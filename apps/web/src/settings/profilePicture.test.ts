import { describe, expect, it } from "vitest";
import { pictureFileError, previewStyle } from "./profilePicture";

describe("pictureFileError", () => {
  it("takes JPEG, PNG and WebP up to exactly 5 MB", () => {
    expect(pictureFileError({ type: "image/png", size: 5_242_880 })).toBeNull();
    expect(pictureFileError({ type: "image/webp", size: 1 })).toBeNull();
    expect(pictureFileError({ type: "image/jpeg", size: 5_242_881 })).toContain("over 5 MB");
    expect(pictureFileError({ type: "image/heic", size: 1 })).toContain("over 5 MB");
  });
});

describe("previewStyle", () => {
  it("shows the middle half of a landscape photo at twice its width", () => {
    // A 2:1 photo: the square is half its width, starting a quarter of the way in, and all of its height.
    const style = previewStyle("blob:p", { x: 25, y: 0, width: 50, height: 100 });

    expect(style.backgroundSize).toBe("200% 100%");
    expect(style.backgroundPosition).toBe("50% 0%");
  });

  it("puts a square from the bottom-right corner at the far end", () => {
    const style = previewStyle("blob:p", { x: 60, y: 60, width: 40, height: 40 });

    expect(style.backgroundSize).toBe("250% 250%");
    expect(style.backgroundPosition).toBe("100% 100%");
  });
});
