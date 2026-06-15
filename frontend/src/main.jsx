import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import "./index.css";
import App from "./App.jsx";
import GenrePage from "./pages/GenrePage.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import { authFetch, clearStoredAuth, getStoredAuth } from "./lib/auth";

function ProtectedRoute({ children }) {
  const location = useLocation();
  const session = getStoredAuth();
  const [status, setStatus] = useState(session?.token ? "checking" : "guest");

  useEffect(() => {
    let cancelled = false;

    if (!session?.token) {
      setStatus("guest");
      return undefined;
    }

    authFetch(`${import.meta.env.VITE_API_URL || "/api"}/auth/me`)
      .then((response) => {
        if (!cancelled) {
          if (response.ok) {
            setStatus("authed");
          } else if (response.status === 401 || response.status === 403) {
            clearStoredAuth();
            setStatus("guest");
          } else {
            setStatus("authed");
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("authed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session?.token]);

  if (status === "checking") {
    return null;
  }

  if (status !== "authed") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Routes>
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <App />
          </ProtectedRoute>
        }
      />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/genre/:genreId"
        element={
          <ProtectedRoute>
            <GenrePage />
          </ProtectedRoute>
        }
      />
    </Routes>
  </BrowserRouter>
);
