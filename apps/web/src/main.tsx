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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NimbusThemeProvider>
      <AppNotifications />
      <App />
    </NimbusThemeProvider>
  </StrictMode>,
);
