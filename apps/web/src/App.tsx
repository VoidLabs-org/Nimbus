import { BrowserRouter, Route, Routes } from "react-router";
import { RequireUser, SessionProvider } from "./auth/session";
import HomePage from "./pages/HomePage";
import RegisterPage from "./pages/RegisterPage";

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
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
