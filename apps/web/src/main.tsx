import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@mantine/core/styles.css";
// Notifications styles must come after core styles
import "@mantine/notifications/styles.css";
// The four Nimbus themes, after Mantine's styles so they win
import "@repo/ui/themes.css";
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import App from "./App.tsx";
import { AppNotifications } from "./shell/AppNotifications";
import { isDesktop } from "./shell/desktop";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* The Desktop app has only the flat themes: glass doesn't suit a window. */}
    <NimbusThemeProvider flatOnly={isDesktop()}>
      <AppNotifications />
      <App />
    </NimbusThemeProvider>
  </StrictMode>,
);
