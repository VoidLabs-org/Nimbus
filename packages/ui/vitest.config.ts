import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The theme system reads and writes the document, browser storage and the system colour scheme.
    environment: "jsdom",
  },
});
