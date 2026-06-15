import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { authFetch, clearStoredAuth, getApiErrorMessage, getStoredAuth, readApiResponse, setStoredAuth } from "../lib/auth";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function Field({ label, type = "text", value, onChange, autoComplete }) {
  return (
    <label style={{ display: "grid", gap: "10px" }}>
      <span
        style={{
          color: "#c7b7ff",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(167,139,250,0.14)",
          color: "#fff",
          borderRadius: "18px",
          padding: "18px 20px",
          outline: "none",
          fontSize: "16px",
        }}
      />
    </label>
  );
}

export default function AuthPage({ mode = "login" }) {
  const [storedSession, setStoredSession] = useState(() => getStoredAuth());
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionReady, setSessionReady] = useState(!storedSession?.token);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isSignup = mode === "signup";
  const title = useMemo(() => (isSignup ? "Create your Movie Man account" : "Welcome back to Movie Man"), [isSignup]);

  useEffect(() => {
    let cancelled = false;

    if (!storedSession?.token) {
      setSessionReady(true);
      return undefined;
    }

    authFetch(`${API_BASE}/auth/me`)
      .then((response) => {
        if (!response.ok) {
          clearStoredAuth();
          if (!cancelled) {
            setStoredSession(null);
            setSessionReady(true);
          }
          return;
        }
        if (!cancelled) {
          setSessionReady(true);
        }
      })
      .catch(() => {
        clearStoredAuth();
        if (!cancelled) {
          setStoredSession(null);
          setSessionReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [storedSession?.token]);

  if (storedSession?.token && sessionReady) {
    return <Navigate to="/" replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (isSignup && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const endpoint = isSignup ? `${API_BASE}/auth/signup` : `${API_BASE}/auth/login`;
      const payload = isSignup
        ? { displayName, username, email, password }
        : { identifier, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const { data, isJson } = await readApiResponse(res, "Authentication failed.");
      if (!res.ok) {
        throw new Error(getApiErrorMessage(data, "Authentication failed."));
      }
      if (!isJson || !data?.token) {
        throw new Error("Authentication API returned an unexpected response.");
      }

      setStoredAuth(data);
      setStoredSession(data);
      const redirectTo = location.state?.from?.pathname || "/";
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#030014", color: "#fff", display: "grid", placeItems: "center", padding: "32px 16px" }}>
      <div
        style={{
          width: "min(620px, 100%)",
          background: "linear-gradient(180deg, rgba(29,24,61,0.96), rgba(11,9,28,0.98))",
          border: "1px solid rgba(167,139,250,0.16)",
          borderRadius: "32px",
          padding: "32px",
          boxShadow: "0 30px 70px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "grid", gap: "10px", marginBottom: "24px" }}>
          <p style={{ margin: 0, color: "#a78bfa", fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", fontSize: "12px" }}>
            Movie Man
          </p>
          <h1 style={{ margin: 0, textAlign: "left", maxWidth: "none", fontSize: "40px", lineHeight: 1.1 }}>
            {title}
          </h1>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.62)", lineHeight: 1.6 }}>
            {isSignup
              ? "Create a real account backed by the API so your profile, history, and recommendations stay yours."
              : "Sign in to continue with your saved profile, AI history, and personalized picks."}
          </p>
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: "18px" }}>
          {isSignup ? (
            <>
              <Field label="Display Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" />
              <Field label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
              <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </>
          ) : (
            <Field
              label="Username or Email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
            />
          )}

          <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isSignup ? "new-password" : "current-password"} />
          {isSignup && (
            <Field
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          )}

          {error && (
            <div
              style={{
                background: "rgba(180,52,92,0.12)",
                border: "1px solid rgba(255,111,145,0.34)",
                color: "#ffb9c8",
                borderRadius: "18px",
                padding: "16px 18px",
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "8px",
              background: "linear-gradient(90deg, #7c63ff, #c27cff)",
              color: "#fff",
              border: "none",
              borderRadius: "999px",
              fontWeight: 800,
              fontSize: "18px",
              padding: "18px 22px",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Please wait..." : isSignup ? "Create account" : "Log in"}
          </button>
        </form>

        <p style={{ margin: "22px 0 0", color: "rgba(255,255,255,0.66)", fontSize: "15px" }}>
          {isSignup ? "Already have an account?" : "Need an account?"}{" "}
          <Link to={isSignup ? "/login" : "/signup"} style={{ color: "#d9ccff", fontWeight: 700 }}>
            {isSignup ? "Log in" : "Sign up"}
          </Link>
        </p>
      </div>
    </div>
  );
}
