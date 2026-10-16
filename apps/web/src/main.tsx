import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@mantine/core/styles.css";
// Notifications styles must come after core styles
import "@mantine/notifications/styles.css";
// The four Nimbus themes, after Mantine's styles so they win
import "@repo/ui/themes.css";
import { Notifications } from "@mantine/notifications";
import { NimbusThemeProvider } from "@repo/ui/nimbus-theme";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NimbusThemeProvider>
      <Notifications />
      <App />
    </NimbusThemeProvider>
  </StrictMode>,
);
