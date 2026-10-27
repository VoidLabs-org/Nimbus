import { QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
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
import ProfilePage from "./pages/ProfilePage";
import ProjectPage from "./pages/ProjectPage";
import ProjectsPage from "./pages/ProjectsPage";
import RolesPage from "./pages/RolesPage";
import SecurityPage from "./pages/SecurityPage";
import TwoStepSignInPage from "./pages/TwoStepSignInPage";
import SettingsOverview from "./settings/SettingsOverview";
import { PASSWORD_WINDOW_PATH } from "./settings/sections";
import { AppShell } from "./shell/AppShell";
import { isDesktop } from "./shell/desktop";
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

// The Desktop app's shell, in its own chunk so the browser never downloads it.
const DesktopShell = lazy(() => import("./shell/DesktopShell"));

/** The shell around every signed-in page: the Sidebar in the Desktop app, the navbar in a browser. */
function SignedInShell() {
  if (!isDesktop()) return <AppShell />;
  return (
    <Suspense fallback={null}>
      <DesktopShell />
    </Suspense>
  );
}

/** Every page of the app, by address. */
export function AppRoutes() {
  return (
    <Routes>
      {/* Every signed-in page, inside the navbar shell (the Sidebar in the Desktop app). */}
      <Route
        element={
          <RequireUser>
            <SignedInShell />
          </RequireUser>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:key" element={<ProjectPage />} />
        {/* Settings: the overview list, and the pages it opens. */}
        <Route path="/settings" element={<SettingsOverview />} />
        <Route path="/settings/profile" element={<ProfilePage />} />
        {/* The password moved onto Profile; old links open its window there. */}
        <Route path="/settings/password" element={<Navigate to={PASSWORD_WINDOW_PATH} replace />} />
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
      <Route path="/login/two-step" element={<TwoStepSignInPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      {/* Where a session lost mid-use lands; no navbar, since nobody is signed in. */}
      <Route path="/session-expired" element={<SessionExpiredPage />} />
    </Routes>
  );
}
