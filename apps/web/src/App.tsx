import { QueryClientProvider } from "@tanstack/react-query";
import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  type Location,
} from "react-router";
import { createQueryClient } from "./api/queryClient";
import { RequireUser, SessionProvider } from "./auth/session";
import { useSession } from "./auth/useSession";
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
import { isSettingsPath, SettingsOverlayContext } from "./settings/settingsOverlay";
import { AppShell } from "./shell/AppShell";
import { isDesktop } from "./shell/desktop";
import { DesktopFrame } from "./shell/DesktopFrame";
import { NotFoundPage, SessionExpiredPage } from "./shell/StatusPages";

export default function App() {
  // One cache for the whole session of the app; the session provider empties it when the User changes.
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <DesktopFrame />
          <AppRoutes />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

// The Desktop app's shell, in its own chunk so the browser never downloads it.
const DesktopShell = lazy(() => import("./shell/DesktopShell"));

/**
 * Something loaded as its own chunk (the Desktop app's shell, its Settings overlay) that couldn't load, because a
 * redeploy removed the chunk while the window stayed open or the connection dropped: `fallback` takes its place, so
 * the window is never left blank.
 */
class ChunkFallback extends Component<
  { what: string; fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`${this.props.what} couldn't load`, error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// The Desktop app's Settings overlay, in its own chunk like its shell.
const SettingsOverlay = lazy(() => import("./shell/SettingsOverlay"));

/** The shell around every signed-in page: the Sidebar in the Desktop app, the navbar in a browser. */
function SignedInShell() {
  if (!isDesktop()) return <AppShell />;
  return (
    <ChunkFallback what="The Desktop app's shell" fallback={<AppShell />}>
      <Suspense fallback={null}>
        <DesktopShell />
      </Suspense>
    </ChunkFallback>
  );
}

/**
 * Settings' pages. In a browser they are pages in the navbar shell; in the Desktop app they open in the Settings
 * overlay over the page the User was on.
 */
const SETTINGS_PAGES = (
  <>
    <Route path="/settings/profile" element={<ProfilePage />} />
    {/* The password moved onto Profile; old links open its window there. */}
    <Route path="/settings/password" element={<Navigate to={PASSWORD_WINDOW_PATH} replace />} />
    <Route path="/settings/security" element={<SecurityPage />} />
    <Route path="/settings/appearance" element={<AppearancePage />} />
    <Route path="/settings/roles" element={<RolesPage />} />
    <Route path="/settings/roles/:key" element={<RolePage />} />
    <Route path="/settings/audit" element={<AuditLogPage />} />
  </>
);

/**
 * Every page of the app, by address. In the Desktop app a Settings address, once the User is signed in, keeps the
 * page they were on (the last address that wasn't Settings; Home for a Settings address opened directly) and opens
 * the Settings overlay over it. Closing the overlay goes back to that page; Back does too.
 */
export function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useSession();
  const settings = isSettingsPath(location.pathname);
  const [behind, setBehind] = useState<Location | null>(null);
  if (!settings && behind?.key !== location.key) setBehind(location);
  const background = isDesktop() && settings && user?.emailVerified ? (behind ?? "/") : null;

  return (
    <>
      <SettingsOverlayContext value={background ? "behind" : "closed"}>
        <Routes location={background ?? location}>
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
            {SETTINGS_PAGES}
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
      </SettingsOverlayContext>
      {background && (
        <ChunkFallback what="The Settings overlay" fallback={null}>
          <Suspense fallback={null}>
            <SettingsOverlay onClose={() => navigate(background)}>
              <Routes>
                {/* Its list stands in for the overview, so Settings itself opens on Profile. */}
                <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
                {SETTINGS_PAGES}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </SettingsOverlay>
          </Suspense>
        </ChunkFallback>
      )}
    </>
  );
}
