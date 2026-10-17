import { BrowserRouter, Route, Routes } from "react-router";
import { RequireUser, SessionProvider } from "./auth/session";
import AppearancePage from "./pages/AppearancePage";
import AuditLogPage from "./pages/AuditLogPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import RolePage from "./pages/RolePage";
import PasswordPage from "./pages/PasswordPage";
import ProfilePage from "./pages/ProfilePage";
import RolesPage from "./pages/RolesPage";
import SettingsLayout from "./settings/SettingsLayout";
import { AppShell } from "./shell/AppShell";

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
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
            {/* Settings: the sidebar (or, on narrow screens, the overview) around each page. */}
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={null} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="password" element={<PasswordPage />} />
              <Route path="appearance" element={<AppearancePage />} />
              <Route path="roles" element={<RolesPage />} />
              <Route path="roles/:key" element={<RolePage />} />
              <Route path="audit" element={<AuditLogPage />} />
            </Route>
          </Route>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
