import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Spinner from "../components/Spinner";
import MovieDetailModal from "../components/MovieDetailModal";
import { authFetch, clearStoredAuth, getStoredAuth } from "../lib/auth";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_KEY = import.meta.env.VITE_TMDB_API_KEY;
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";

const GENRES = [
  { id: 28, name: "Action", emoji: "💥", short: "ACT", color: "#ff4f75" },
  { id: 35, name: "Comedy", emoji: "😂", short: "JOY", color: "#f59e0b" },
  { id: 18, name: "Drama", emoji: "🎭", short: "DRM", color: "#7c63ff" },
  { id: 27, name: "Horror", emoji: "👻", short: "HRR", color: "#8b8fa8" },
  { id: 878, name: "Sci-Fi", emoji: "🚀", short: "SCI", color: "#31c4ff" },
  { id: 10749, name: "Romance", emoji: "💗", short: "ROM", color: "#ff52b6" },
  { id: 53, name: "Thriller", emoji: "🔪", short: "THR", color: "#a78bfa" },
  { id: 16, name: "Animation", emoji: "🎨", short: "ANI", color: "#2ad7b1" },
  { id: 80, name: "Crime", emoji: "🕵️", short: "CRM", color: "#b0b7c4" },
  { id: 12, name: "Adventure", emoji: "🗺️", short: "ADV", color: "#8bc34a" },
];

function normalizeMovie(movie) {
  return {
    ...movie,
    poster_url:
      movie.poster_url ||
      (movie.poster_path ? `${TMDB_IMG}${movie.poster_path}` : null),
  };
}

function getWatchlistKey(movie) {
  if (!movie) return "";
  return String(
    movie.tmdb_id ||
      movie.tmdbId ||
      movie.movie_id ||
      movie.id ||
      `${movie.title || "movie"}-${movie.year || movie.release_date || ""}`,
  );
}

function normalizeWatchlistMovie(movie) {
  if (!movie) return null;
  return {
    movie_id: movie.movie_id || null,
    tmdb_id: movie.tmdb_id || movie.tmdbId || (typeof movie.id === "number" ? movie.id : null),
    title: movie.title || "Unknown",
    year: movie.year || movie.release_date?.split("-")[0] || movie.first_air_date?.split("-")[0] || null,
    genre: movie.genre || movie.genres_str || "",
    poster_url: movie.poster_url || (movie.poster_path ? `${TMDB_IMG}${movie.poster_path}` : null),
    poster_path: movie.poster_path || null,
    backdrop_path: movie.backdrop_path || null,
    release_date: movie.release_date || null,
    original_language: movie.original_language || null,
    vote_average: movie.vote_average ?? null,
    score: movie.score ?? null,
  };
}

function deriveDashboardSignals(history) {
  if (!history.length) {
    return {
      stats: {
        moviesTrained: 0,
        tasteSync: 0.0,
        aiSearches: 0,
        moviesExplored: 0,
      },
      corePreferences: [
        { label: "Mood Intensity", value: 0, color: "#ff5a8f" },
        { label: "Abstract Ratio", value: 0, color: "#b55cff" },
        { label: "Pacing Speed", value: 0, color: "#59e3ff" },
      ],
      radar: [
        { label: "CYBERPUNK", value: 0 },
        { label: "THRILLER", value: 0 },
        { label: "MINIMALISM", value: 0 },
        { label: "PSYCHO", value: 0 },
        { label: "INDIE", value: 0 },
        { label: "NEON", value: 0 },
      ],
      tasteLabel: "Fresh Profile",
    };
  }

  const queryText = history
    .map((item) => item.query_text.toLowerCase())
    .join(" ");
  const recommendationCount = history.reduce(
    (sum, item) => sum + (item.recommendations?.length || 0),
    0,
  );
  const genres = history.flatMap((item) =>
    (item.recommendations || [])
      .flatMap((rec) => String(rec.genre || "").split(","))
      .map((genre) => genre.trim().toLowerCase())
      .filter(Boolean),
  );

  const genreWeights = new Map();
  genres.forEach((genre) =>
    genreWeights.set(genre, (genreWeights.get(genre) || 0) + 1),
  );

  const moodIntensity = Math.min(
    100,
    18 +
      genres.filter((genre) =>
        ["thriller", "horror", "crime", "action"].includes(genre),
      ).length *
        7,
  );
  const abstractRatio = Math.min(
    100,
    12 +
      queryText.split("mind").length * 12 +
      queryText.split("psych").length * 10 +
      queryText.split("weird").length * 8,
  );
  const pacingSpeed = Math.min(
    100,
    16 +
      genres.filter((genre) =>
        ["action", "adventure", "sci-fi", "comedy"].includes(genre),
      ).length *
        6,
  );

  const tasteSync = Number(
    Math.min(
      10,
      3.4 +
        history.length * 0.55 +
        Math.min(2.2, genreWeights.size * 0.16) +
        Math.min(1.4, recommendationCount * 0.03),
    ).toFixed(1),
  );

  const radarValues = {
    CYBERPUNK: Math.min(100, 10 + (genreWeights.get("sci-fi") || 0) * 10),
    THRILLER: Math.min(100, 8 + (genreWeights.get("thriller") || 0) * 10),
    MINIMALISM: Math.min(100, 8 + history.length * 4),
    PSYCHO: Math.min(
      100,
      10 +
        queryText.split("psych").length * 18 +
        queryText.split("mind").length * 14,
    ),
    INDIE: Math.min(
      100,
      8 +
        queryText.split("indie").length * 16 +
        queryText.split("drama").length * 6,
    ),
    NEON: Math.min(
      100,
      8 +
        queryText.split("neon").length * 22 +
        queryText.split("cyber").length * 22,
    ),
  };

  const topGenres = [...genreWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);
  const tasteLabel = topGenres.length
    ? `AI ${topGenres.map((name) => name[0].toUpperCase() + name.slice(1)).join("-")} Visionary`
    : "AI Taste in Motion";

  return {
    stats: {
      moviesTrained: recommendationCount,
      tasteSync,
      aiSearches: history.length,
      moviesExplored: recommendationCount,
    },
    corePreferences: [
      { label: "Mood Intensity", value: moodIntensity, color: "#ff5a8f" },
      { label: "Abstract Ratio", value: abstractRatio, color: "#b55cff" },
      { label: "Pacing Speed", value: pacingSpeed, color: "#59e3ff" },
    ],
    radar: Object.entries(radarValues).map(([label, value]) => ({
      label,
      value,
    })),
    tasteLabel,
  };
}

function RadarChart({ points, activeLabel, onActivate }) {
  const center = 126;
  const radius = 72;

  const polygonPoints = points
    .map((point, index) => {
      const angle = ((Math.PI * 2) / points.length) * index - Math.PI / 2;
      const scaled = (point.value / 100) * radius;
      const x = center + Math.cos(angle) * scaled;
      const y = center + Math.sin(angle) * scaled;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 320 278"
      style={{
        width: "100%",
        maxWidth: 320,
        height: "auto",
        margin: "-8px auto 0",
        display: "block",
      }}
    >
      {[1, 0.75, 0.5, 0.25].map((factor) => (
        <polygon
          key={factor}
          points={points
            .map((point, index) => {
              const angle =
                ((Math.PI * 2) / points.length) * index - Math.PI / 2;
              const scaled = radius * factor;
              const x = center + Math.cos(angle) * scaled;
              const y = center + Math.sin(angle) * scaled;
              return `${x},${y}`;
            })
            .join(" ")}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
        />
      ))}

      {points.map((point, index) => {
        const angle = ((Math.PI * 2) / points.length) * index - Math.PI / 2;
        const x = center + Math.cos(angle) * radius;
        const y = center + Math.sin(angle) * radius;
        const isActive = activeLabel === point.label;
        return (
          <g key={point.label}>
            <line
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke={
                isActive ? "rgba(183,148,255,0.45)" : "rgba(255,255,255,0.05)"
              }
            />
            <text
              x={center + Math.cos(angle) * (radius + 28)}
              y={center + Math.sin(angle) * (radius + 28)}
              textAnchor="middle"
              fill={isActive ? "#dac5ff" : "rgba(255,255,255,0.34)"}
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.14em",
                cursor: "pointer",
              }}
              onMouseEnter={() => onActivate?.(point.label)}
              onClick={() => onActivate?.(point.label)}
            >
              {point.label}
            </text>
          </g>
        );
      })}

      <polygon
        points={polygonPoints}
        fill="rgba(162,94,255,0.22)"
        stroke="#9d65ff"
        strokeWidth="2"
      />
      {points.map((point, index) => {
        const angle = ((Math.PI * 2) / points.length) * index - Math.PI / 2;
        const scaled = (point.value / 100) * radius;
        const x = center + Math.cos(angle) * scaled;
        const y = center + Math.sin(angle) * scaled;
        const isActive = activeLabel === point.label;
        return (
          <circle
            key={point.label}
            cx={x}
            cy={y}
            r={isActive ? "7" : "5"}
            fill={isActive ? "#f2eaff" : "#ad6bff"}
            stroke="#c8a7ff"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => onActivate?.(point.label)}
            onClick={() => onActivate?.(point.label)}
          />
        );
      })}
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const uploadAvatarRef = useRef(null);
  const uploadBannerRef = useRef(null);
  const session = getStoredAuth();

  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [dashboardReady, setDashboardReady] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [tmdbTrending, setTmdbTrending] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activePreference, setActivePreference] = useState("Mood Intensity");
  const [activeRadarLabel, setActiveRadarLabel] = useState("CYBERPUNK");
  const [activeWatchlistId, setActiveWatchlistId] = useState(null);

  const derived = useMemo(() => deriveDashboardSignals(history), [history]);
  const preferenceDetails = {
    "Mood Intensity":
      "Tracks how intense, emotional, or high-stakes your recent prompts feel.",
    "Abstract Ratio":
      "Measures how much your searches lean toward strange, layered, or mind-bending ideas.",
    "Pacing Speed":
      "Shows whether your recent taste trends toward kinetic, fast-moving picks or slower burns.",
  };
  const radarDetails = {
    CYBERPUNK:
      "Future-tech, speculative, and high-concept edges in your recommendation profile.",
    THRILLER:
      "Suspense, danger, and tension-driven storytelling currently shaping your taste map.",
    MINIMALISM:
      "Cleaner, quieter, more restrained movies showing up in your searches.",
    PSYCHO:
      "Psychological pressure, paranoia, and mind-game energy in your recent picks.",
    INDIE:
      "Smaller, moodier, character-first films influencing your recommendation shape.",
    NEON: "Stylized, visually bold, and synthetic atmosphere present in your overall taste.",
  };
  const activePreferenceData =
    derived.corePreferences.find((item) => item.label === activePreference) ||
    derived.corePreferences[0];
  const activeRadarData =
    derived.radar.find((item) => item.label === activeRadarLabel) ||
    derived.radar[0];
  const watchlist = (profile?.watchlist || []).map(normalizeMovie);
  const selectedMovieInWatchlist = Boolean(
    selectedMovie &&
      watchlist.some(
        (item) => getWatchlistKey(item) === getWatchlistKey(selectedMovie),
      ),
  );

  useEffect(() => {
    let cancelled = false;

    if (!session?.token) {
      navigate("/login", { replace: true });
      return undefined;
    }

    setDashboardReady(false);
    setHistoryLoading(true);
    setHistoryError(null);

    authFetch(`${API_BASE}/auth/me`)
      .then(async (authResponse) => {
        if (!authResponse.ok) {
          clearStoredAuth();
          if (!cancelled) {
            navigate("/login", { replace: true });
          }
          return;
        }

        const [profileResponse, historyResponse] = await Promise.all([
          authFetch(`${API_BASE}/profile`),
          authFetch(`${API_BASE}/history?limit=20`),
        ]);

        const profileData = profileResponse.ok
          ? await profileResponse.json()
          : null;
        const historyData = historyResponse.ok
          ? await historyResponse.json()
          : [];

        if (!cancelled) {
          setProfile(profileData || {});
          setHistory(Array.isArray(historyData) ? historyData : []);
          setHistoryError(
            historyResponse.ok ? null : "Could not load AI history yet.",
          );
          setDashboardReady(true);
          setHistoryLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setHistoryError(
            error?.message || "Could not load your signed-in dashboard.",
          );
          setDashboardReady(true);
          setHistoryLoading(false);
        }
      });

    if (TMDB_KEY) {
      fetch(`${TMDB_BASE}/trending/movie/week`, {
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${TMDB_KEY}`,
        },
      })
        .then((response) => response.json())
        .then((data) => setTmdbTrending(data.results?.slice(0, 6) || []))
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [navigate, session?.token]);

  const uploadProfileAsset = async (target, file) => {
    const form = new FormData();
    form.append("file", file);
    setSaving(true);
    try {
      const response = await authFetch(
        `${API_BASE}/profile/upload?target=${target}`,
        {
          method: "POST",
          body: form,
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.detail || `Could not upload ${target}.`);
      }
      setProfile(data.profile);
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    clearStoredAuth();
    navigate("/login");
  };

  const addMovieToWatchlist = async (movie) => {
    if (!movie || !session?.token) return;

    const normalized = normalizeWatchlistMovie(movie);
    if (!normalized) return;

    const currentWatchlist = profile?.watchlist || [];
    const alreadySaved = currentWatchlist.some(
      (item) => getWatchlistKey(item) === getWatchlistKey(normalized),
    );
    if (alreadySaved) return;

    const nextWatchlist = [normalized, ...currentWatchlist].slice(0, 24);

    try {
      const response = await authFetch(`${API_BASE}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchlist: nextWatchlist }),
      });
      const updatedProfile = await response.json();
      if (!response.ok) {
        throw new Error(updatedProfile?.detail || "Could not update watchlist.");
      }
      setProfile(updatedProfile);
      setActiveWatchlistId(getWatchlistKey(normalized));
      } catch (error) {
        alert(error.message);
      }
    };

  const removeMovieFromWatchlist = async (movie) => {
    if (!movie || !session?.token) return;

    const movieKey = getWatchlistKey(movie);
    if (!movieKey) return;

    const currentWatchlist = profile?.watchlist || [];
    const nextWatchlist = currentWatchlist.filter(
      (item) => getWatchlistKey(item) !== movieKey,
    );

    try {
      const response = await authFetch(`${API_BASE}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchlist: nextWatchlist }),
      });
      const updatedProfile = await response.json();
      if (!response.ok) throw new Error(updatedProfile?.detail || "Could not update watchlist.");
      setProfile(updatedProfile);
      if (activeWatchlistId === movieKey) {
        setActiveWatchlistId(getWatchlistKey(nextWatchlist[0]) || "");
      }
    } catch (error) {
      alert(error.message);
    }
  };

  const sidebarWidth = 228;
  const sidebarItems = [
    { label: "Home", short: "HM", href: "/" },
    { label: "Dashboard", short: "DB", href: "/dashboard", active: true },
    { label: "AI History", short: "AI", href: "#history" },
    // { label: "Genres", short: "GN", href: "#genres" },
    // { label: "Watchlist", short: "WL", href: "#watchlist" },
  ];

  if (!dashboardReady && !historyError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background:
            "radial-gradient(circle at top left, rgba(92,77,255,0.18), transparent 24%), radial-gradient(circle at top right, rgba(133,92,255,0.12), transparent 20%), #030014",
          color: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "18px 22px",
            borderRadius: 18,
            background: "rgba(20,15,48,0.82)",
            border: "1px solid rgba(167,139,250,0.16)",
            boxShadow: "0 24px 70px rgba(4,2,18,0.45)",
            backdropFilter: "blur(18px)",
          }}
        >
          <Spinner />
          <span style={{ color: "rgba(255,255,255,0.82)", fontSize: 14 }}>
            Loading your dashboard...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(92,77,255,0.18), transparent 24%), radial-gradient(circle at top right, rgba(133,92,255,0.12), transparent 20%), #030014",
        color: "#fff",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
        style={{
          position: "fixed",
          top: 14,
          left: 14,
          width: 46,
          height: 46,
          borderRadius: 16,
          border: "1px solid rgba(167,139,250,0.24)",
          background: "rgba(14,11,38,0.88)",
          color: "#f5efff",
          fontSize: 22,
          cursor: "pointer",
          zIndex: 60,
          backdropFilter: "blur(18px)",
          boxShadow: "0 16px 32px rgba(5,3,18,0.45)",
        }}
      >
        {collapsed ? "☰" : "X"}
      </button>
      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: sidebarWidth,
          background:
            "linear-gradient(180deg, rgba(28,20,64,0.97) 0%, rgba(14,10,36,0.985) 54%, rgba(8,5,22,0.99) 100%)",
          borderRight: "1px solid rgba(167,139,250,0.14)",
          padding: "74px 12px 14px",
          zIndex: 50,
          transition: "transform 0.28s ease, box-shadow 0.28s ease",
          overflow: "hidden",
          transform: collapsed
            ? "translateX(calc(-100% - 28px))"
            : "translateX(0)",
          boxShadow: collapsed ? "none" : "0 28px 80px rgba(4,2,18,0.56)",
          backdropFilter: "blur(18px)",
        }}
      >
        <div
          style={{
            padding: "0 12px 14px",
            marginBottom: 14,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Link to="/" style={{ textDecoration: "none" }}>
            {/* <div
              style={{
                color: "#8f6bff",
                fontSize: 22,
                fontWeight: 900,
                lineHeight: 0.92,
                letterSpacing: "-0.04em",
              }}
            >
              MOVIE
            </div>
            <div
              style={{
                color: "#8f6bff",
                fontSize: 22,
                fontWeight: 900,
                lineHeight: 0.92,
                letterSpacing: "-0.04em",
              }}
            >
              MAN
            </div> */}
            <img className="w-14 h-14" src="./ilogo.png" alt="Logo" />
            <Link to="/" className="text-2xl font-bold text-gradient">
              Movie Man
            </Link>
            <div
              style={{
                marginTop: 8,
                color: "rgba(213,198,255,0.48)",
                letterSpacing: "0.3em",
                fontSize: 10,
              }}
            >
              PROFILE HUB
            </div>
          </Link>
        </div>

        <div
          style={{
            background:
              "linear-gradient(180deg, rgba(124,99,255,0.22), rgba(77,48,181,0.18))",
            border: "1px solid rgba(167,139,250,0.28)",
            borderRadius: 18,
            padding: 13,
            marginBottom: 14,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                display: "grid",
                placeItems: "center",
                background: "linear-gradient(135deg,#8b63ff,#b96cff)",
                fontWeight: 800,
              }}
            >
              AI
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                Profile Dashboard
              </div>
              <div
                style={{
                  color: "rgba(205,191,255,0.52)",
                  fontSize: 9,
                  letterSpacing: "0.16em",
                }}
              >
                EVERYTHING IN ONE PLACE
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 7, marginTop: 14 }}>
          {sidebarItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "11px 12px",
                borderRadius: 14,
                textDecoration: "none",
                color: item.active ? "#f4eeff" : "rgba(255,255,255,0.6)",
                background: item.active
                  ? "linear-gradient(90deg, rgba(124,99,255,0.26), rgba(124,99,255,0.14))"
                  : "transparent",
                border: item.active
                  ? "1px solid rgba(167,139,250,0.22)"
                  : "1px solid transparent",
              }}
            >
              <span
                style={{
                  fontFamily: "monospace",
                  color: item.active ? "#a78bfa" : "rgba(255,255,255,0.42)",
                }}
              >
                {item.short}
              </span>
              <span style={{ fontSize: 13 }}>{item.label}</span>
            </a>
          ))}
        </div>

        <button
          onClick={logout}
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: 14,
            background: "linear-gradient(90deg,#7b63ff,#ba67ff)",
            border: "none",
            color: "#fff",
            borderRadius: 14,
            padding: "12px 14px",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 18px 32px rgba(123,99,255,0.28)",
          }}
        >
          Log Out
        </button>
      </aside>

      <div
        style={{
          marginLeft: collapsed ? 0 : sidebarWidth,
          transition: "margin-left 0.28s ease",
          paddingLeft: collapsed ? 20 : 14,
        }}
      >
        <div
          style={{
            minHeight: 176,
            background: `linear-gradient(180deg, rgba(18,13,46,0.72), rgba(3,2,18,0.96)), radial-gradient(circle at top left, rgba(118,87,255,0.24), transparent 32%), url(${profile?.banner?.url || "/hero-bg.png"}) center/cover`,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            padding: "12px 16px 12px",
            boxShadow: "inset 0 -80px 120px rgba(4,2,18,0.55)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => uploadBannerRef.current?.click()}
              disabled={saving}
              style={{
                background: "rgba(10,9,22,0.72)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#fff",
                padding: "9px 14px",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              Change Banner
            </button>
            <input
              ref={uploadBannerRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) =>
                event.target.files?.[0] &&
                uploadProfileAsset("banner", event.target.files[0])
              }
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 26,
            }}
          >
            <div style={{ position: "relative" }}>
              <button
                onClick={() => uploadAvatarRef.current?.click()}
                disabled={saving}
                style={{
                  width: 78,
                  height: 78,
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "3px solid #8b63ff",
                  padding: 0,
                  background: "linear-gradient(135deg,#8b63ff,#c874ff)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 36,
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 10px 24px rgba(0,0,0,0.32)",
                }}
              >
                {profile?.avatar?.url ? (
                  <img
                    src={profile.avatar.url}
                    alt="Avatar"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  (profile?.displayName?.[0] || "A").toUpperCase()
                )}
              </button>
              <button
                onClick={() => uploadAvatarRef.current?.click()}
                style={{
                  position: "absolute",
                  right: -2,
                  bottom: 4,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "#7b63ff",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                ED
              </button>
              <input
                ref={uploadAvatarRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) =>
                  event.target.files?.[0] &&
                  uploadProfileAsset("avatar", event.target.files[0])
                }
              />
            </div>

            <div style={{ paddingBottom: 10 }}>
              <h1
                style={{
                  margin: 0,
                  textAlign: "left",
                  maxWidth: "none",
                  fontSize: 34,
                  lineHeight: 0.95,
                }}
              >
                {(profile?.displayName || "Alex Rivers").toUpperCase()}
              </h1>
              <div
                style={{
                  marginTop: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  border: "1px solid rgba(124,99,255,0.34)",
                  borderRadius: 999,
                  padding: "6px 12px",
                  color: "#8f7cff",
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              >
                {derived.tasteLabel}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "0 14px 18px" }}>
          {/* <div
            style={{
              marginTop: -8,
              background: "rgba(25,19,54,0.96)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 20,
              padding: "14px 14px",
            }}
          >
            <p
              style={{
                margin: "0 0 6px",
                color: "rgba(255,255,255,0.78)",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.12em",
              }}
            >
              DASHBOARD + PROFILE IN ONE PLACE
            </p>
            <p
              style={{
                margin: 0,
                color: "rgba(255,255,255,0.56)",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              Your profile identity, AI taste snapshot, recent searches, genre
              shortcuts, and watchlist preview now live inside one unified page.
            </p>
          </div> */}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 12,
              marginTop: 12,
            }}
          >
            {[
              {
                label: "PROFILE",
                value: derived.stats.moviesTrained,
                title: "Movies Trained",
              },
              {
                label: "PROFILE",
                value: derived.stats.tasteSync.toFixed(1),
                title: "Taste Sync",
              },
              {
                label: "DASHBOARD",
                value: derived.stats.aiSearches,
                title: "AI Searches",
              },
              {
                label: "DASHBOARD",
                value: derived.stats.moviesExplored,
                title: "Movies Explored",
              },
            ].map((stat) => (
              <div
                key={stat.title}
                style={{
                  background: "rgba(17,14,37,0.96)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 20,
                  padding: "14px 14px",
                }}
              >
                <p
                  style={{
                    margin: "0 0 10px",
                    color: "rgba(255,255,255,0.34)",
                    letterSpacing: "0.14em",
                    fontSize: 10,
                  }}
                >
                  {stat.label}
                </p>
                <div
                  style={{
                    fontSize: 46,
                    color: "#7a59ff",
                    fontWeight: 800,
                    lineHeight: 0.9,
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 13,
                    color: "rgba(255,255,255,0.72)",
                  }}
                >
                  {stat.title}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginTop: 14,
              alignItems: "start",
            }}
          >
            <section
              style={{
                background: "rgba(17,14,37,0.96)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 20,
                padding: "15px",
                minHeight: 344,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <h2
                style={{
                  textAlign: "left",
                  maxWidth: "none",
                  fontSize: 16,
                  marginBottom: 20,
                  marginTop: "25px",
                }}
              >
                CORE PREFERENCES
              </h2>
              <div style={{ display: "grid", gap: 12 }}>
                {derived.corePreferences.map((item) => {
                  const isActive = activePreferenceData?.label === item.label;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onMouseEnter={() => setActivePreference(item.label)}
                      onClick={() => setActivePreference(item.label)}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 6,
                        }}
                      >
                        <div
                          style={{
                            color: isActive
                              ? "#f3eaff"
                              : "rgba(255,255,255,0.56)",
                            fontFamily: "monospace",
                            fontSize: 12,
                          }}
                        >
                          {item.label}
                        </div>
                        <div
                          style={{
                            color: isActive
                              ? item.color
                              : "rgba(255,255,255,0.38)",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {Math.round(item.value)}%
                        </div>
                      </div>
                      <div
                        style={{
                          height: 6,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.06)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${item.value}%`,
                            height: "100%",
                            background: item.color,
                            borderRadius: 999,
                            boxShadow: isActive
                              ? `0 0 18px ${item.color}`
                              : "none",
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
              <div
                style={{
                  marginTop: "30px",
                  padding: "10px 12px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{
                    color: activePreferenceData?.color || "#fff",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    marginBottom: 5,
                  }}
                >
                  {activePreferenceData?.label || "Mood Intensity"}
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.62)",
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                >
                  {preferenceDetails[activePreferenceData?.label] ||
                    preferenceDetails["Mood Intensity"]}
                </div>
              </div>
              <button
                style={{
                  marginTop: 12,
                  width: "100%",
                  background: "transparent",
                  border: "1px solid rgba(124,99,255,0.24)",
                  color: "#8f7cff",
                  borderRadius: 12,
                  marginTop: "50px",
                  padding: "11px 14px",
                  fontFamily: "monospace",
                  fontSize: 13,
                  cursor: "default",
                }}
              >
                EDIT PROFILE
              </button>
            </section>

            <section
              style={{
                background: "rgba(27,19,59,0.96)",
                border: "1px solid rgba(124,99,255,0.18)",
                borderRadius: 20,
                padding: "15px",
                minHeight: 344,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 8,
                }}
              >
                <h2
                  style={{
                    textAlign: "left",
                    maxWidth: "none",
                    fontSize: 16,
                    margin: 0,
                  }}
                >
                  GENRE BREAKDOWN
                </h2>
                <span
                  style={{ color: "#a78bfa", fontSize: 11, fontWeight: 700 }}
                >
                  {activeRadarData?.label || "CYBERPUNK"}
                </span>
              </div>
              <div style={{ flex: 1, display: "grid", alignItems: "start" }}>
                <RadarChart
                  points={derived.radar}
                  activeLabel={activeRadarData?.label}
                  onActivate={setActiveRadarLabel}
                />
              </div>
              <div
                style={{
                  marginTop: 2,
                  padding: "10px 12px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{
                    color: "#eadfff",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    marginBottom: 5,
                  }}
                >
                  {activeRadarData?.label || "CYBERPUNK"} ·{" "}
                  {Math.round(activeRadarData?.value || 0)}%
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.62)",
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                >
                  {radarDetails[activeRadarData?.label] ||
                    radarDetails.CYBERPUNK}
                </div>
              </div>
            </section>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 0.99fr",
              gap: 12,
              marginTop: 14,
              alignItems: "start",
            }}
          >
            <section
              id="history"
              style={{
                background: "rgba(17,14,37,0.96)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 20,
                padding: "18px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <h2
                  style={{
                    textAlign: "left",
                    maxWidth: "none",
                    fontSize: 18,
                    margin: 0,
                  }}
                >
                  AI SEARCH HISTORY
                </h2>
                <Link
                  to="/?ai=1"
                  style={{
                    color: "#a78bfa",
                    textDecoration: "none",
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  NEW AI SEARCH
                </Link>
              </div>

              {historyLoading && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    color: "rgba(255,255,255,0.4)",
                  }}
                >
                  <Spinner /> Loading history...
                </div>
              )}

              {historyError && (
                <div
                  style={{
                    background: "rgba(239,68,68,0.1)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    color: "#fca5a5",
                    padding: 14,
                    borderRadius: 14,
                  }}
                >
                  ⚠️ {historyError}
                </div>
              )}

              {!historyLoading && !historyError && history.length === 0 && (
                <div
                  style={{
                    padding: "32px 18px",
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
                  No AI searches yet. Run one from the homepage and your
                  personalized history will appear here.
                </div>
              )}

              <div style={{ display: "grid", gap: 8 }}>
                {history.map((item) => (
                  <div
                    key={item.query_id}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 16,
                      padding: 14,
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      navigate(
                        `/?ai=1&q=${encodeURIComponent(item.query_text)}`,
                      )
                    }
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 700 }}>
                        ✨ {item.query_text}
                      </div>
                      <div
                        style={{
                          color: "rgba(255,255,255,0.34)",
                          whiteSpace: "nowrap",
                          fontSize: 12,
                        }}
                      >
                        {new Date(item.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div
                      style={{ display: "flex", gap: 8, overflow: "hidden" }}
                    >
                      {item.recommendations
                        ?.slice(0, 5)
                        .map((recommendation, index) => {
                          const movie = normalizeMovie(recommendation);
                          return (
                            <button
                              key={`${item.query_id}-${index}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedMovie(movie);
                              }}
                              style={{
                                width: 40,
                                height: 54,
                                borderRadius: 8,
                                overflow: "hidden",
                                border: "none",
                                background: "#1a1a2e",
                                padding: 0,
                                flexShrink: 0,
                                cursor: "pointer",
                              }}
                            >
                              {movie.poster_url ? (
                                <img
                                  src={movie.poster_url}
                                  alt={movie.title}
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    display: "grid",
                                    placeItems: "center",
                                    color: "rgba(255,255,255,0.26)",
                                  }}
                                >
                                  FILM
                                </div>
                              )}
                            </button>
                          );
                        })}
                      {item.recommendations?.length > 5 && (
                        <div
                          style={{
                            width: 40,
                            height: 54,
                            borderRadius: 8,
                            background: "rgba(108,99,255,0.16)",
                            border: "1px solid rgba(108,99,255,0.3)",
                            display: "grid",
                            placeItems: "center",
                            color: "#b49bff",
                            fontWeight: 700,
                          }}
                        >
                          +{item.recommendations.length - 5}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div style={{ display: "grid", gap: 16 }}>
              <section
                id="genres"
                style={{
                  background: "rgba(27,19,59,0.96)",
                  border: "1px solid rgba(124,99,255,0.18)",
                  borderRadius: 20,
                  padding: "18px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <h2
                    style={{
                      textAlign: "left",
                      maxWidth: "none",
                      fontSize: 18,
                      margin: 0,
                    }}
                  >
                    BROWSE GENRES
                  </h2>
                  <span
                    style={{
                      color: "#b39cff",
                      fontFamily: "monospace",
                      fontSize: 13,
                    }}
                  >
                    {GENRES.length} AVAILABLE
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                  }}
                >
                  {GENRES.map((genre) => (
                    <Link
                      key={genre.id}
                      to={`/genre/${genre.id}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        textDecoration: "none",
                        color: "#fff",
                        borderRadius: 14,
                        padding: "12px 14px",
                        background: `${genre.color}12`,
                        border: `1px solid ${genre.color}30`,
                        fontWeight: 700,
                      }}
                    >
                      <span>{genre.name}</span>
                      <span
                        style={{
                          color: "rgba(255,255,255,0.7)",
                          fontFamily: "monospace",
                        }}
                      >
                        {genre.short}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>

              <section
                id="watchlist"
                style={{
                  background: "rgba(27,19,59,0.96)",
                  border: "1px solid rgba(124,99,255,0.18)",
                  borderRadius: 20,
                  padding: "18px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 14,
                  }}
                >
                  <h2
                    style={{
                      textAlign: "left",
                      maxWidth: "none",
                      fontSize: 18,
                      margin: 0,
                    }}
                  >
                    MY WATCHLIST
                  </h2>
                </div>
                <p
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    lineHeight: 1.6,
                    marginTop: 0,
                    marginBottom: 12,
                    fontSize: 13,
                  }}
                >
                  {activeWatchlistId
                    ? "Selected watchlist poster opened with full details. Click another poster to preview a different title."
                    : watchlist.length
                      ? "These are the movies you have saved to your personal watchlist. Open one for details or remove it anytime."
                      : "Movies you save from the detail modal will appear here. Your watchlist is currently empty."}
                </p>
                {watchlist.length ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 8,
                    }}
                  >
                    {watchlist.map((movie) => {
                    const movieKey = getWatchlistKey(movie);
                    const isSavedToWatchlist = true;

                    return (
                      <div
                        key={movieKey}
                        style={{
                          position: "relative",
                          aspectRatio: "2/3",
                        }}
                      >
                        <button
                          type="button"
                          onMouseEnter={() => setActiveWatchlistId(movieKey)}
                          onClick={() => {
                            setActiveWatchlistId(movieKey);
                            setSelectedMovie(normalizeMovie(movie));
                          }}
                          style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: 12,
                            overflow: "hidden",
                            background: "#1a1a2e",
                            border:
                              activeWatchlistId === movieKey
                                ? "1px solid rgba(167,139,250,0.85)"
                                : "1px solid rgba(255,255,255,0.06)",
                            padding: 0,
                            cursor: "pointer",
                            boxShadow:
                              activeWatchlistId === movieKey
                                ? "0 0 0 2px rgba(167,139,250,0.15)"
                                : "none",
                            transform:
                              activeWatchlistId === movieKey
                                ? "translateY(-2px)"
                                : "none",
                            transition:
                              "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
                          }}
                        >
                          {movie.poster_url || movie.poster_path ? (
                            <img
                              src={movie.poster_url || `${TMDB_IMG}${movie.poster_path}`}
                              alt={movie.title}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : null}
                        </button>
                        {isSavedToWatchlist ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeMovieFromWatchlist(movie);
                            }}
                            style={{
                              position: "absolute",
                              top: 8,
                              right: 8,
                              width: 28,
                              height: 28,
                              borderRadius: 999,
                              border: "1px solid rgba(255,255,255,0.18)",
                              background: "rgba(8, 6, 20, 0.78)",
                              color: "#fff",
                              fontSize: 16,
                              lineHeight: 1,
                              cursor: "pointer",
                              display: "grid",
                              placeItems: "center",
                              backdropFilter: "blur(10px)",
                            }}
                            aria-label={`Remove ${movie.title} from watchlist`}
                            title="Remove from watchlist"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    );
                    })}
                  </div>
                ) : (
                  <div
                    style={{
                      minHeight: 220,
                      borderRadius: 16,
                      border: "1px dashed rgba(167,139,250,0.2)",
                      background: "rgba(255,255,255,0.02)",
                      display: "grid",
                      placeItems: "center",
                      padding: "24px 20px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ maxWidth: 320 }}>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: "#f5efff",
                          marginBottom: 8,
                        }}
                      >
                        Your watchlist is empty
                      </div>
                      <div
                        style={{
                          color: "rgba(255,255,255,0.56)",
                          fontSize: 13,
                          lineHeight: 1.6,
                        }}
                      >
                        Click the `+` button in any movie detail modal to save a title here for later.
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>

      <MovieDetailModal
        movie={selectedMovie}
        onClose={() => setSelectedMovie(null)}
        onAddToWatchlist={addMovieToWatchlist}
        onRemoveFromWatchlist={removeMovieFromWatchlist}
        isInWatchlist={selectedMovieInWatchlist}
      />
    </div>
  );
}
