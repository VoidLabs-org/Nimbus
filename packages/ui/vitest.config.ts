import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The theme system reads and writes the document, browser storage and the system colour scheme.
    environment: "jsdom",
    // Vitest blanks stylesheets by default; themes.test.ts reads this one's text to compare it with @repo/tokens.
    css: { include: [/themes\.css/] },
  },
});
