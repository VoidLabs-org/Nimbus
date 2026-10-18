import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { createQueryClient } from "./api/queryClient";
import { RequireUser, SessionProvider } from "./auth/session";
import AppearancePage from "./pages/AppearancePage";
import AuditLogPage from "./pages/AuditLogPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import RolePage from "./pages/RolePage";
import PasswordPage from "./pages/PasswordPage";
import ProfilePage from "./pages/ProfilePage";
import ProjectPage from "./pages/ProjectPage";
import ProjectsPage from "./pages/ProjectsPage";
import RolesPage from "./pages/RolesPage";
import SecurityPage from "./pages/SecurityPage";
import SettingsOverview from "./settings/SettingsOverview";
import { AppShell } from "./shell/AppShell";
import { NotFoundPage, SessionExpiredPage } from "./shell/StatusPages";

export default function App() {
  // One cache for the whole session of the app; the session provider empties it when the User changes.
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <AppRoutes />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

/** Every page of the app, by address. */
export function AppRoutes() {
  return (
    <Routes>
      {/* Every signed-in page, inside the navbar shell. */}
      <Route
        element={
          <RequireUser>
            <AppShell />
          </RequireUser>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:key" element={<ProjectPage />} />
        {/* Settings: the overview list, and the pages it opens. */}
        <Route path="/settings" element={<SettingsOverview />} />
        <Route path="/settings/profile" element={<ProfilePage />} />
        <Route path="/settings/password" element={<PasswordPage />} />
        <Route path="/settings/security" element={<SecurityPage />} />
        <Route path="/settings/appearance" element={<AppearancePage />} />
        <Route path="/settings/roles" element={<RolesPage />} />
        <Route path="/settings/roles/:key" element={<RolePage />} />
        <Route path="/settings/audit" element={<AuditLogPage />} />
        {/* Any other address: not found, with the navbar so the User can leave. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      {/* Where a session lost mid-use lands; no navbar, since nobody is signed in. */}
      <Route path="/session-expired" element={<SessionExpiredPage />} />
    </Routes>
  );
}
