import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      // Forward API calls to Spring Boot in dev, so the browser sees one origin (no CORS).
      "/api": "http://localhost:8080",
    },
  },
});
