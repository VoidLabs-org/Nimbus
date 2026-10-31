import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The theme system reads and writes the document, browser storage and the system colour scheme.
    environment: "jsdom",
    // Vitest blanks stylesheets, ?raw text included; themes.test.ts reads themes.css's text (only as ?raw, so no
    // test that imports the stylesheet starts processing its font imports).
    css: { include: [/themes\.css\?raw$/] },
  },
});
