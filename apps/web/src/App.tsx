import { BrowserRouter, Route, Routes } from "react-router";
import { RequireUser, SessionProvider } from "./auth/session";
import AppearancePage from "./pages/AppearancePage";
import AuditLogPage from "./pages/AuditLogPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import RolePage from "./pages/RolePage";
import RolesPage from "./pages/RolesPage";

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route
            path="/"
            element={
              <RequireUser>
                <HomePage />
              </RequireUser>
            }
          />
          <Route
            path="/settings/roles"
            element={
              <RequireUser>
                <RolesPage />
              </RequireUser>
            }
          />
          <Route
            path="/settings/roles/:key"
            element={
              <RequireUser>
                <RolePage />
              </RequireUser>
            }
          />
          <Route
            path="/settings/appearance"
            element={
              <RequireUser>
                <AppearancePage />
              </RequireUser>
            }
          />
          <Route
            path="/settings/audit"
            element={
              <RequireUser>
                <AuditLogPage />
              </RequireUser>
            }
          />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
