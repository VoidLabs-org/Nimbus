import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  server: {
    // IPv4, not `localhost`: Node may resolve that to IPv6 [::1] only, where `adb reverse` (the Mobile app on an
    // emulator or a USB phone) can't reach it. Browsers and the Desktop app still open http://localhost:3000.
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
    proxy: {
      // Forward API calls to Spring Boot in dev, so the browser sees one origin (no CORS).
      "/api": "http://localhost:8080",
    },
  },
});
