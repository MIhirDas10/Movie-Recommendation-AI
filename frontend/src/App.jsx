import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useDebounce } from "react-use";
import Search from "./components/Search";
import Spinner from "./components/Spinner";
import MovieCard from "./components/MovieCard";
import MovieDetailModal from "./components/MovieDetailModal";
import { getTrendingMovies, updateSearchCount } from "./appwrite";
import { useRecommendations } from "./hooks/useRecommendations";
import { authFetch, clearStoredAuth, getStoredAuth } from "./lib/auth";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const API_BASE_URL = "https://api.themoviedb.org/3";
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const API_OPTIONS = {
  method: "GET",
  headers: {
    accept: "application/json",
    Authorization: `Bearer ${API_KEY}`,
  },
};

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const HERO_FALLBACKS = [
  {
    id: "hero-black-adam",
    title: "Black Adam",
    poster_path: "/8QVDXDiOGHRcAD4oM6MXjE0osSj.jpg",
    vote_average: 6.8,
    release_date: "2022-10-19",
    original_language: "en",
  },
  {
    id: "hero-dnd",
    title: "Dungeons & Dragons: Honor Among Thieves",
    poster_path: "/A7AoNT06aRAc4SV89Dwxj3EYAgC.jpg",
    vote_average: 7.3,
    release_date: "2023-03-23",
    original_language: "en",
  },
  {
    id: "hero-enola",
    title: "Enola Holmes 2",
    poster_path: "/tegBpjM5ODoYoM1NjaiHVLEA0QM.jpg",
    vote_average: 7.4,
    release_date: "2022-11-04",
    original_language: "en",
  },
];

const GENRES = [
  { id: 28, name: "Action", emoji: "💥" },
  { id: 35, name: "Comedy", emoji: "😂" },
  { id: 18, name: "Drama", emoji: "🎭" },
  { id: 27, name: "Horror", emoji: "👻" },
  { id: 878, name: "Sci-Fi", emoji: "🚀" },
  { id: 10749, name: "Romance", emoji: "💗" },
  { id: 53, name: "Thriller", emoji: "🔪" },
  { id: 16, name: "Animation", emoji: "🎨" },
  { id: 80, name: "Crime", emoji: "🕵️" },
  { id: 12, name: "Adventure", emoji: "🗺️" },
];

function normalizeMovieForModal(movie) {
  if (!movie) return null;
  return {
    ...movie,
    poster_url:
      movie.poster_url ||
      (movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : null),
    year:
      movie.year ||
      movie.release_date?.split("-")[0] ||
      movie.first_air_date?.split("-")[0] ||
      "",
    score: movie.score ?? movie.vote_average ?? null,
    genre: movie.genre || movie.genres_str || "",
  };
}

function normalizeAIRecommendation(movie) {
  return {
    ...movie,
    id: movie.movie_id || `${movie.title}-${movie.year}`,
    poster_path: movie.poster_url ? null : movie.poster_path,
    poster_url: movie.poster_url || null,
    vote_average:
      movie.score == null
        ? null
        : Number(movie.score) <= 1
          ? Number(movie.score) * 10
          : Number(movie.score) <= 5
            ? Number(movie.score) * 2
            : Number(movie.score),
  };
}

function MiniMovieCard({ movie, onClick }) {
  const poster =
    movie.poster_url ||
    (movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : null);

  return (
    <button
      type="button"
      className="mini-card"
      onClick={() => onClick?.(normalizeMovieForModal(movie))}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
      }}
    >
      <div className="mini-card-img">
        {poster ? (
          <img src={poster} alt={movie.title} loading="lazy" />
        ) : (
          <div className="mini-card-placeholder">🎬</div>
        )}
        {(movie.vote_average ?? movie.score) != null && (
          <span className="mini-card-score">
            ★{" "}
            {(Number(movie.vote_average ?? movie.score) <= 1
              ? Number(movie.vote_average ?? movie.score) * 10
              : Number(movie.vote_average ?? movie.score) <= 5
                ? Number(movie.vote_average ?? movie.score) * 2
                : Number(movie.vote_average ?? movie.score)
            ).toFixed(1)}
          </span>
        )}
      </div>
    </button>
  );
}

function GenreRow({ genre, onSelectMovie }) {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const rowRef = useRef(null);

  useEffect(() => {
    fetch(
      `${API_BASE_URL}/discover/movie?with_genres=${genre.id}&sort_by=popularity.desc&page=1`,
      API_OPTIONS,
    )
      .then((response) => response.json())
      .then((data) => {
        setMovies(data.results?.slice(0, 20) || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [genre.id]);

  const scroll = (dir) =>
    rowRef.current?.scrollBy({ left: dir * 800, behavior: "smooth" });

  if (loading) {
    return (
      <div className="genre-row-wrap">
        <h3 className="genre-row-title">
          {genre.emoji} {genre.name}
        </h3>
        <div
          style={{
            height: 180,
            display: "flex",
            alignItems: "center",
            paddingLeft: 16,
          }}
        >
          <Spinner />
        </div>
      </div>
    );
  }

  if (!movies.length) return null;

  return (
    <div className="genre-row-wrap" id={`genre-${genre.id}`}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h3 className="genre-row-title">
          {genre.emoji} {genre.name}
        </h3>
        <Link to={`/genre/${genre.id}`} className="genre-see-all">
          See all →
        </Link>
      </div>
      <div className="genre-row-outer">
        <button className="genre-arrow left" onClick={() => scroll(-1)}>
          ‹
        </button>
        <div className="genre-row-scroll" ref={rowRef}>
          {movies.map((movie) => (
            <MiniMovieCard
              key={movie.id}
              movie={movie}
              onClick={onSelectMovie}
            />
          ))}
        </div>
        <button className="genre-arrow right" onClick={() => scroll(1)}>
          ›
        </button>
      </div>
    </div>
  );
}

function formatScore(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const numeric = Number(value);
  if (numeric <= 1) return (numeric * 10).toFixed(1);
  if (numeric <= 5) return (numeric * 2).toFixed(1);
  return numeric.toFixed(1);
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
    tmdb_id:
      movie.tmdb_id ||
      movie.tmdbId ||
      (typeof movie.id === "number" ? movie.id : null),
    title: movie.title || "Unknown",
    year:
      movie.year ||
      movie.release_date?.split("-")[0] ||
      movie.first_air_date?.split("-")[0] ||
      null,
    genre: movie.genre || movie.genres_str || "",
    poster_url:
      movie.poster_url ||
      (movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : null),
    poster_path: movie.poster_path || null,
    backdrop_path: movie.backdrop_path || null,
    release_date: movie.release_date || null,
    original_language: movie.original_language || null,
    vote_average: movie.vote_average ?? null,
    score: movie.score ?? null,
  };
}

export default function App() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [authSession, setAuthSession] = useState(() => getStoredAuth());
  const [authReady, setAuthReady] = useState(() => !getStoredAuth()?.token);
  const [authUser, setAuthUser] = useState(() => getStoredAuth()?.user || null);

  const [searchTerm, setSearchTerm] = useState("");
  const [isAI, setIsAI] = useState(false);
  const [aiTopK, setAiTopK] = useState(10);
  const [hasAISearched, setHasAISearched] = useState(false);
  const {
    recommendations,
    loading: aiLoading,
    error: aiError,
    search: aiSearch,
    history: aiHistory,
    fetchHistory,
  } = useRecommendations();

  const [errorMessage, setErrorMessage] = useState("");
  const [movieList, setMovieList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [trendingMovies, setTrendingMovies] = useState([]);
  const [heroPosters, setHeroPosters] = useState([]);
  const [heroReady, setHeroReady] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [profile, setProfile] = useState(null);
  const [showForYou, setShowForYou] = useState(true);
  const genreRef = useRef(null);
  const plansRef = useRef(null);

  useDebounce(() => setDebouncedSearchTerm(searchTerm), 500, [searchTerm]);

  const isAuthenticated = Boolean(authSession?.token && authUser);
  const personalizedHistoryItem = isAuthenticated ? aiHistory[0] || null : null;
  const personalizedMovies = useMemo(
    () =>
      (personalizedHistoryItem?.recommendations || []).map(
        normalizeAIRecommendation,
      ),
    [personalizedHistoryItem],
  );
  const forYouCarouselMovies = useMemo(() => {
    if (personalizedMovies.length <= 1) return personalizedMovies;
    return [...personalizedMovies, ...personalizedMovies];
  }, [personalizedMovies]);

  const fetchMovies = async (query = "") => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const endpoint = query
        ? `${API_BASE_URL}/search/movie?query=${encodeURIComponent(query)}`
        : `${API_BASE_URL}/discover/movie?sort_by=popularity.desc`;
      const response = await fetch(endpoint, API_OPTIONS);
      if (!response.ok) throw new Error("Failed to fetch movies");
      const data = await response.json();
      setMovieList(data.results || []);

      if (query && data.results?.length > 0) {
        await updateSearchCount(query, data.results[0]);
      }
    } catch (error) {
      setErrorMessage("Error fetching movies. Please try again later.");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMovies(debouncedSearchTerm);
  }, [debouncedSearchTerm]);

  useEffect(() => {
    let cancelled = false;

    getTrendingMovies()
      .then((movies) => {
        if (!cancelled) {
          setTrendingMovies(movies || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTrendingMovies([]);
        }
      });

    fetch(`${API_BASE_URL}/movie/now_playing?page=1`, API_OPTIONS)
      .then((response) => response.json())
      .then((data) => {
        const candidates = (data.results || [])
          .filter((movie) => movie.poster_path)
          .slice(0, 3);

        if (!cancelled) {
          if (candidates.length === 3) {
            setHeroPosters(candidates);
          } else {
            setHeroPosters(HERO_FALLBACKS);
          }
          setHeroReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHeroPosters(HERO_FALLBACKS);
          setHeroReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!authSession?.token) {
      setAuthUser(null);
      setProfile(null);
      setAuthReady(true);
      return undefined;
    }

    setAuthReady(false);
    setAuthUser(authSession.user || null);

    authFetch(`${API_BASE}/auth/me`)
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            clearStoredAuth();
            if (!cancelled) {
              setAuthSession(null);
              setAuthUser(null);
              setProfile(null);
              setAuthReady(true);
            }
            return;
          }

          if (!cancelled) {
            setAuthUser(authSession.user || null);
            setProfile({ user: authSession.user || null });
            setAuthReady(true);
          }
          return;
        }

        const me = await response.json();
        if (cancelled) return;
        setAuthUser(me);

        try {
          const profileResponse = await authFetch(`${API_BASE}/profile`);
          if (!profileResponse.ok) {
            if (!cancelled) {
              setProfile({ user: me });
              setAuthReady(true);
            }
            return;
          }

          const profileData = await profileResponse.json();
          if (!cancelled) {
            setProfile({ ...profileData, user: me });
            setAuthReady(true);
          }
        } catch {
          if (!cancelled) {
            setProfile({ user: me });
            setAuthReady(true);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthUser(authSession.user || null);
          setProfile({ user: authSession.user || null });
          setAuthReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authSession?.token]);

  useEffect(() => {
    if (!isAuthenticated || !authReady) return;
    fetchHistory(8);
  }, [isAuthenticated, authReady, fetchHistory]);

  useEffect(() => {
    const ai = searchParams.get("ai");
    const query = searchParams.get("q");
    if (ai === "1" && query) {
      setIsAI(true);
      setSearchTerm(query);
      setHasAISearched(true);
      aiSearch(query, aiTopK);
    }
  }, [searchParams]);

  const handleAISearch = async (q = searchTerm) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setHasAISearched(true);
    await aiSearch(trimmed, aiTopK);
    if (isAuthenticated) {
      await fetchHistory(8);
    }
  };

  const avatarUrl = profile?.avatar?.url || null;
  const fallbackInitial =
    profile?.displayName?.[0] || profile?.user?.displayName?.[0] || "M";
  const watchlist = profile?.watchlist || [];
  const selectedMovieInWatchlist = Boolean(
    selectedMovie &&
    watchlist.some(
      (item) => getWatchlistKey(item) === getWatchlistKey(selectedMovie),
    ),
  );

  const addMovieToWatchlist = async (movie) => {
    if (!movie) return;
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    const normalized = normalizeWatchlistMovie(movie);
    if (!normalized) return;

    const alreadySaved = watchlist.some(
      (item) => getWatchlistKey(item) === getWatchlistKey(normalized),
    );
    if (alreadySaved) return;

    const nextWatchlist = [normalized, ...watchlist].slice(0, 24);

    try {
      const response = await authFetch(`${API_BASE}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchlist: nextWatchlist }),
      });
      const updatedProfile = await response.json();
      if (!response.ok) {
        throw new Error(
          updatedProfile?.detail || "Could not update watchlist.",
        );
      }
      setProfile((current) => ({
        ...(current || {}),
        ...updatedProfile,
        user: current?.user || authUser || null,
      }));
    } catch (error) {
      alert(error.message);
    }
  };

  const removeMovieFromWatchlist = async (movie) => {
    if (!movie) return;
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    const movieKey = getWatchlistKey(movie);
    if (!movieKey) return;

    const nextWatchlist = watchlist.filter(
      (item) => getWatchlistKey(item) !== movieKey,
    );

    try {
      const response = await authFetch(`${API_BASE}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchlist: nextWatchlist }),
      });
      const updatedProfile = await response.json();
      if (!response.ok) {
        throw new Error(
          updatedProfile?.detail || "Could not update watchlist.",
        );
      }
      setProfile((current) => ({
        ...(current || {}),
        ...updatedProfile,
        user: current?.user || authUser || null,
      }));
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <main>
      <div className="pattern" />
      <div className="wrapper">
        <nav className="nav-link flex justify-between items-center py-4">
          <div className="flex items-center gap-3">
            <img className="w-14 h-14" src="./ilogo.png" alt="Logo" />
            <Link to="/" className="text-2xl font-bold text-gradient">
              Movie Man
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() =>
                genreRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.7)",
                fontSize: "20px",
                fontWeight: 600,
                padding: "6px 16px",
                borderRadius: "20px",
                cursor: "pointer",
              }}
            >
              Genres
            </button>
            <button
              onClick={() =>
                plansRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
              style={{
                background: "none",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.7)",
                fontSize: "20px",
                fontWeight: 600,
                padding: "6px 16px",
                borderRadius: "20px",
                cursor: "pointer",
              }}
            >
              Plans
            </button>
            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    overflow: "hidden",
                    display: "grid",
                    placeItems: "center",
                    background: "linear-gradient(135deg,#7d63ff,#c17cff)",
                    boxShadow: "0 10px 24px rgba(108,99,255,0.28)",
                    textDecoration: "none",
                    color: "#fff",
                    fontWeight: 800,
                    border: "3px solid rgba(255,255,255,0.82)",
                  }}
                  aria-label="Open dashboard"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile avatar"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: "22px" }}>{fallbackInitial}</span>
                  )}
                </Link>
              </>
            ) : authReady ? (
              <>
                <Link
                  to="/login"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff",
                    fontSize: "16px",
                    fontWeight: 700,
                    padding: "10px 18px",
                    borderRadius: "18px",
                    textDecoration: "none",
                  }}
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  style={{
                    background: "linear-gradient(135deg,#6c63ff,#a78bfa)",
                    color: "#fff",
                    fontSize: "16px",
                    fontWeight: 800,
                    padding: "10px 18px",
                    borderRadius: "18px",
                    textDecoration: "none",
                    boxShadow: "0 10px 22px rgba(108,99,255,0.22)",
                  }}
                >
                  Sign Up
                </Link>
              </>
            ) : null}
          </div>
        </nav>

        <header>
          {heroReady ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 0,
                marginBottom: "14px",
              }}
            >
              {heroPosters.map((movie, index) => (
                <button
                  key={movie.id || movie.title}
                  type="button"
                  onClick={() =>
                    setSelectedMovie(normalizeMovieForModal(movie))
                  }
                  style={{
                    width: 220,
                    height: 320,
                    borderRadius: 18,
                    overflow: "hidden",
                    border: "none",
                    background: "#140f2c",
                    cursor: "pointer",
                    transform:
                      index === 0
                        ? "translateX(36px) rotate(-7deg)"
                        : index === 2
                          ? "translateX(-36px) rotate(7deg)"
                          : "translateY(-10px)",
                    boxShadow: "0 18px 36px rgba(0,0,0,0.36)",
                    transition: "transform 0.25s ease, box-shadow 0.25s ease",
                    zIndex: index === 1 ? 3 : 2,
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.transform =
                      index === 0
                        ? "translateX(36px) rotate(-7deg) translateY(-8px)"
                        : index === 2
                          ? "translateX(-36px) rotate(7deg) translateY(-8px)"
                          : "translateY(-16px)";
                    event.currentTarget.style.boxShadow =
                      "0 24px 48px rgba(0,0,0,0.48)";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.transform =
                      index === 0
                        ? "translateX(36px) rotate(-7deg)"
                        : index === 2
                          ? "translateX(-36px) rotate(7deg)"
                          : "translateY(-10px)";
                    event.currentTarget.style.boxShadow =
                      "0 18px 36px rgba(0,0,0,0.36)";
                  }}
                >
                  <img
                    src={
                      movie.poster_path
                        ? `${TMDB_IMAGE_BASE}${movie.poster_path}`
                        : "/no-movie.png"
                    }
                    alt={movie.title}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                </button>
              ))}
            </div>
          ) : (
            <div style={{ height: 334, marginBottom: "14px" }} />
          )}

          <h1>
            Find <span className="text-gradient">Movies</span> You'll Enjoy
          </h1>
          <h2
            style={{ marginBottom: "40px" }}
            className="flex justify-center items-center"
          >
            Right In Your Grasp
          </h2>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: "14px",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "4px",
                background: "rgba(255,255,255,0.05)",
                padding: "4px",
                borderRadius: "12px",
              }}
            >
              <button
                onClick={() => {
                  setIsAI(false);
                  setHasAISearched(false);
                  setSearchTerm("");
                }}
                style={{
                  background: !isAI
                    ? "linear-gradient(135deg,#6c63ff,#a78bfa)"
                    : "transparent",
                  border: "none",
                  color: !isAI ? "#fff" : "rgba(255,255,255,0.45)",
                  fontWeight: 700,
                  fontSize: "15px",
                  padding: "8px 22px",
                  borderRadius: "9px",
                  cursor: "pointer",
                  boxShadow: !isAI
                    ? "0 4px 14px rgba(108,99,255,0.35)"
                    : "none",
                }}
              >
                🔍 Search
              </button>
              <button
                onClick={() => {
                  setIsAI(true);
                  setHasAISearched(false);
                  setSearchTerm("");
                }}
                style={{
                  background: isAI
                    ? "linear-gradient(135deg,#6c63ff,#a78bfa)"
                    : "transparent",
                  border: "none",
                  color: isAI ? "#fff" : "rgba(255,255,255,0.45)",
                  fontWeight: 700,
                  fontSize: "15px",
                  padding: "8px 22px",
                  borderRadius: "9px",
                  cursor: "pointer",
                  boxShadow: isAI ? "0 4px 14px rgba(108,99,255,0.35)" : "none",
                }}
              >
                ✨ AI Search
              </button>
            </div>
          </div>

          {!isAI && (
            <Search searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
          )}

          {isAI && (
            <div style={{ maxWidth: "820px", margin: "0 auto" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: "rgba(206,206,251,0.05)",
                  border: "1.5px solid rgba(108,99,255,0.45)",
                  borderRadius: "14px",
                  padding: "10px 14px",
                  boxShadow: "0 0 0 4px rgba(108,99,255,0.06)",
                }}
              >
                <span style={{ fontSize: "16px", flexShrink: 0 }}>✨</span>
                <input
                  type="text"
                  placeholder="e.g. dark comedy with anxiety and absurd humor"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAISearch()}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#fff",
                    fontSize: "14px",
                    fontFamily: "DM Sans, sans-serif",
                  }}
                />
                <select
                  value={aiTopK}
                  onChange={(e) => setAiTopK(Number(e.target.value))}
                  style={{
                    background: "rgba(22,16,48,0.98)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#fff",
                    fontSize: "12px",
                    padding: "5px 10px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    colorScheme: "dark",
                  }}
                >
                  {[5, 10, 15, 20].map((n) => (
                    <option
                      key={n}
                      value={n}
                      style={{
                        background: "#161030",
                        color: "#f5efff",
                      }}
                    >
                      {n} picks
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleAISearch()}
                  disabled={aiLoading || !searchTerm.trim()}
                  style={{
                    background: "linear-gradient(135deg,#6c63ff,#a78bfa)",
                    border: "none",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "13px",
                    padding: "9px 20px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    opacity: aiLoading || !searchTerm.trim() ? 0.45 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {aiLoading ? "Thinking…" : "Find Movies →"}
                </button>
              </div>
            </div>
          )}
        </header>

        <h2
          style={{
            marginTop: "80px",
            fontSize: "35px",
            fontWeight: 900,
          }}
        >
          All Movies
        </h2>

        {!isAI && isAuthenticated && authReady && !personalizedHistoryItem && (
          <>
            <div style={{ height: 24 }} />
            <section
              style={{
                borderRadius: "28px",
                overflow: "hidden",
                background:
                  "linear-gradient(180deg, rgba(27,22,58,0.98), rgba(13,10,32,0.98))",
                border: "1px solid rgba(167,139,250,0.12)",
                padding: "24px 28px",
                marginBottom: "-44px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 24,
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                      textAlign: "left",
                      maxWidth: "none",
                      fontSize: "24px",
                    }}
                  >
                    For You
                  </h2>
                  <p
                    style={{
                      margin: "8px 0 0",
                      color: "rgba(255,255,255,0.58)",
                      fontSize: "14px",
                    }}
                  >
                    Personalized picks will appear here once you start using AI
                    search with this account.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsAI(true);
                    setHasAISearched(false);
                  }}
                  style={{
                    background: "linear-gradient(135deg,#6c63ff,#a78bfa)",
                    border: "none",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "13px",
                    padding: "10px 16px",
                    borderRadius: "12px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Try AI Search
                </button>
              </div>
            </section>
          </>
        )}

        {!isAI && personalizedHistoryItem && (
          <>
            <div style={{ height: 24 }} />
            <section
              style={{
                borderRadius: "28px",
                overflow: "hidden",
                background:
                  "linear-gradient(180deg, rgba(27,22,58,0.98), rgba(13,10,32,0.98))",
                border: "1px solid rgba(167,139,250,0.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "24px 28px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                      textAlign: "left",
                      maxWidth: "none",
                      fontSize: "24px",
                    }}
                  >
                    For You
                  </h2>
                  <p
                    style={{
                      margin: "8px 0 0",
                      color: "rgba(255,255,255,0.58)",
                      fontSize: "14px",
                    }}
                  >
                    Your latest personalized AI picks, right under the search
                    bar.
                  </p>
                  <p
                    style={{
                      margin: "10px 0 0",
                      color: "#bca6ff",
                      fontSize: "13px",
                      fontFamily: "monospace",
                    }}
                  >
                    Latest query: {personalizedHistoryItem.query_text}
                  </p>
                </div>
                <button
                  onClick={() => setShowForYou((current) => !current)}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#fff",
                    fontSize: "14px",
                    fontWeight: 700,
                    padding: "12px 18px",
                    borderRadius: "14px",
                    cursor: "pointer",
                  }}
                >
                  {showForYou ? "Hide Picks" : "Show Picks"}
                </button>
              </div>

              {showForYou && (
                <div className="for-you-carousel-shell">
                  <div
                    className={
                      personalizedMovies.length > 1
                        ? "for-you-carousel-track is-animated"
                        : "for-you-carousel-track"
                    }
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(180px, 1fr))",
                      gap: "16px",
                    }}
                  >
                    {forYouCarouselMovies.map((movie, index) => (
                      <button
                        key={`${movie.id}-${index}`}
                        onClick={() =>
                          setSelectedMovie(normalizeMovieForModal(movie))
                        }
                        style={{
                          background: "#140f2c",
                          border: "1px solid rgba(167,139,250,0.12)",
                          borderRadius: "20px",
                          overflow: "hidden",
                          textAlign: "left",
                          color: "#fff",
                          cursor: "pointer",
                          padding: 0,
                          display: "flex",
                          flexDirection: "column",
                          minHeight: 0,
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            height: 270,
                            background: "#0d0a1f",
                          }}
                        >
                          <img
                            src={movie.poster_url || "/no-movie.png"}
                            alt={movie.title}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                          {formatScore(movie.vote_average) && (
                            <div
                              style={{
                                position: "absolute",
                                top: 10,
                                right: 10,
                                background: "rgba(0,0,0,0.74)",
                                color: "#ffd84f",
                                border: "1px solid rgba(255,210,0,0.3)",
                                padding: "4px 10px",
                                borderRadius: 10,
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              ★ {formatScore(movie.vote_average)}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            padding: "14px 14px 16px",
                            display: "grid",
                            gap: "10px",
                            flex: 1,
                          }}
                        >
                          <div>
                            <p
                              style={{
                                margin: 0,
                                fontWeight: 700,
                                fontSize: 14,
                                lineHeight: 1.35,
                                minHeight: 38,
                              }}
                            >
                              {movie.title}
                            </p>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span style={{ color: "#fff", fontSize: 14 }}>
                              {movie.year || "N/A"}
                            </span>
                            {movie.genre && (
                              <span
                                style={{
                                  color: "#bba9ff",
                                  background: "rgba(108,99,255,0.16)",
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  fontSize: 12,
                                }}
                              >
                                {movie.genre}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {trendingMovies.length > 0 && (
          <section className="trending mt-[100px] mb-[40px]">
            <h2 className="mb-2">Trending Movies</h2>
            <ul>
              {trendingMovies.map((movie, index) => (
                <li key={movie.$id}>
                  <p>{index + 1}</p>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedMovie(
                        normalizeMovieForModal({
                          title: movie.title,
                          poster_url: movie.poster_url,
                          vote_average: movie.vote_average || movie.rating,
                          year: movie.release_date?.slice(0, 4),
                        }),
                      )
                    }
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <img
                      src={movie.poster_url}
                      alt={movie.title}
                      className="h-[180px] w-[126px] rounded-lg object-cover"
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isAI && hasAISearched && (
          <section style={{ marginTop: "40px" }}>
            {aiLoading && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  color: "rgba(255,255,255,0.55)",
                  fontSize: "14px",
                  padding: "2rem 0",
                }}
              >
                <Spinner />
                <span>AI is searching 3,650 movies…</span>
              </div>
            )}

            {aiError && (
              <div
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  color: "#fca5a5",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  fontSize: "13px",
                  marginBottom: "16px",
                }}
              >
                ⚠️ {aiError}
              </div>
            )}

            {!aiLoading && recommendations.length > 0 && (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "20px",
                  }}
                >
                  <h2>{recommendations.length} AI Picks for You</h2>
                  <button
                    onClick={() => {
                      setHasAISearched(false);
                      setSearchTerm("");
                    }}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "rgba(255,255,255,0.5)",
                      fontSize: "12px",
                      padding: "6px 14px",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    Clear ✕
                  </button>
                </div>
                <ul
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))",
                    gap: "14px",
                    listStyle: "none",
                    padding: 0,
                  }}
                >
                  {recommendations.map((movie) => {
                    const normalized = normalizeAIRecommendation(movie);
                    return (
                      <li
                        key={`${movie.rank}-${movie.title}`}
                        style={{
                          background: "#0f0d23",
                          border: "1px solid rgba(255,255,255,0.07)",
                          borderRadius: "12px",
                          overflow: "hidden",
                          cursor: "pointer",
                        }}
                        onClick={() =>
                          setSelectedMovie(normalizeMovieForModal(normalized))
                        }
                      >
                        <div
                          style={{
                            position: "relative",
                            height: "220px",
                            background: "#1a1a2e",
                          }}
                        >
                          {normalized.poster_url ? (
                            <img
                              src={normalized.poster_url}
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
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "32px",
                              }}
                            >
                              🎬
                            </div>
                          )}
                          <div
                            style={{
                              position: "absolute",
                              top: "6px",
                              left: "6px",
                              background: "rgba(108,99,255,0.85)",
                              color: "#fff",
                              fontSize: "10px",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: "5px",
                            }}
                          >
                            #{movie.rank}
                          </div>
                          {formatScore(normalized.vote_average) && (
                            <div
                              style={{
                                position: "absolute",
                                top: "6px",
                                right: "6px",
                                background: "rgba(0,0,0,0.65)",
                                color: "#ffd700",
                                fontSize: "10px",
                                fontWeight: 700,
                                padding: "2px 7px",
                                borderRadius: "5px",
                                border: "1px solid rgba(255,210,0,0.3)",
                              }}
                            >
                              ★ {formatScore(normalized.vote_average)}
                            </div>
                          )}
                        </div>
                        <div style={{ padding: "10px 12px" }}>
                          <p
                            style={{
                              fontSize: "12px",
                              fontWeight: 700,
                              color: "#fff",
                              margin: "0 0 5px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {movie.title}
                          </p>
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                              flexWrap: "wrap",
                              marginBottom: "4px",
                            }}
                          >
                            {movie.year && (
                              <span style={{ fontSize: "10px", color: "#fff" }}>
                                {movie.year}
                              </span>
                            )}
                            {movie.genre && (
                              <span
                                style={{
                                  fontSize: "10px",
                                  color: "#a78bfa",
                                  background: "rgba(108,99,255,0.15)",
                                  padding: "1px 7px",
                                  borderRadius: "10px",
                                }}
                              >
                                {movie.genre}
                              </span>
                            )}
                          </div>
                          {movie.reason && (
                            <p
                              style={{
                                fontSize: "10px",
                                color: "rgba(255,255,255,0.5)",
                                fontStyle: "italic",
                                lineHeight: 1.4,
                                margin: 0,
                                display: "-webkit-box",
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              "{movie.reason}"
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        )}

        {!isAI && (
          <section
            className="all-movies"
            style={{ marginTop: personalizedHistoryItem ? 42 : 80 }}
          >
            {/* <h2>All Movies</h2> */}
            {isLoading ? (
              <Spinner />
            ) : errorMessage ? (
              <p className="text-red-500">{errorMessage}</p>
            ) : (
              <ul>
                {movieList.map((movie) => (
                  <MovieCard
                    key={movie.id}
                    movie={movie}
                    onClick={(selected) =>
                      setSelectedMovie(normalizeMovieForModal(selected))
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        )}

        <div ref={genreRef} style={{ marginTop: "60px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <h2>Browse by Genre</h2>
            <Link
              to="/dashboard"
              style={{
                fontSize: "13px",
                color: "#a78bfa",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              View Dashboard →
            </Link>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "32px",
            }}
          >
            {GENRES.map((genre) => (
              <a
                key={genre.id}
                href={`#genre-${genre.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  document
                    .getElementById(`genre-${genre.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.7)",
                  fontSize: "13px",
                  fontWeight: 600,
                  padding: "7px 18px",
                  borderRadius: "20px",
                  textDecoration: "none",
                }}
              >
                {genre.emoji} {genre.name}
              </a>
            ))}
          </div>

          {GENRES.map((genre) => (
            <GenreRow
              key={genre.id}
              genre={genre}
              onSelectMovie={setSelectedMovie}
            />
          ))}
        </div>

        <section
          ref={plansRef}
          style={{ marginTop: "90px", position: "relative" }}
        >
          <div
            style={{
              position: "absolute",
              top: -90,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: "clamp(82px, 16vw, 220px)",
              fontWeight: 900,
              color: "rgba(214,199,255,0.12)",
              letterSpacing: "-0.06em",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            Pricing
          </div>

          <p
            style={{
              margin: "0 0 12px",
              color: "#8b7cff",
              fontWeight: 700,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              fontSize: 12,
            }}
          >
            Plans
          </p>
          <h2
            style={{
              textAlign: "left",
              maxWidth: "none",
              fontSize: "56px",
              lineHeight: 1.1,
              marginBottom: 28,
            }}
          >
            Pick the experience that matches how you watch.
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "0.82fr 1fr 0.82fr",
              gap: 18,
            }}
          >
            {[
              {
                title: "Free Plan.",
                price: "Free",
                items: [
                  "Up to 8 AI searches per day",
                  "Basic recommendation history",
                  "Trending and genre browsing",
                  "Movie detail modal access",
                  "Starter profile dashboard",
                ],
              },
              {
                title: "Standard Plan",
                price: "$9.99/m",
                featured: true,
                items: [
                  "Unlimited AI searches",
                  "Saved profile taste memory",
                  "Deeper semantic recommendations",
                  "Priority support by email",
                  "Expanded dashboard insights",
                ],
              },
              {
                title: "Pro Plan",
                price: "$19.99/m",
                items: [
                  "Unlimited searches with faster ranking",
                  "Collaborative watchlists and sharing",
                  "Full dashboard analytics",
                  "Priority support and early features",
                  "Enhanced security and sync tools",
                ],
              },
            ].map((plan) => (
              <div
                key={plan.title}
                style={{
                  background:
                    "linear-gradient(180deg, rgba(33,26,68,0.96), rgba(15,11,34,0.98))",
                  border: "1px solid rgba(167,139,250,0.22)",
                  borderRadius: 30,
                  overflow: "hidden",
                  position: "relative",
                  boxShadow: plan.featured
                    ? "0 22px 48px rgba(108,99,255,0.18)"
                    : "none",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 180,
                    height: 90,
                    borderRadius: "50%",
                    background: "rgba(210,190,255,0.5)",
                    filter: "blur(24px)",
                  }}
                />
                <div
                  style={{
                    padding: "28px 28px 24px",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <p style={{ margin: 0, color: "#fff", fontSize: 20 }}>
                    {plan.title}
                  </p>
                  <h3
                    style={{
                      margin: "10px 0 0",
                      fontSize: 64,
                      lineHeight: 1,
                      color: "#fff",
                      fontWeight: 800,
                    }}
                  >
                    {plan.price}
                  </h3>
                </div>
                <div
                  style={{ height: 1, background: "rgba(255,255,255,0.07)" }}
                />
                <div style={{ padding: "28px" }}>
                  <div style={{ display: "grid", gap: 18 }}>
                    {plan.items.map((item) => (
                      <div
                        key={item}
                        style={{
                          display: "flex",
                          gap: 12,
                          alignItems: "flex-start",
                          color: "rgba(255,255,255,0.82)",
                        }}
                      >
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            display: "grid",
                            placeItems: "center",
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            color: "#fff",
                            fontSize: 14,
                            flexShrink: 0,
                          }}
                        >
                          ✓
                        </span>
                        <span style={{ lineHeight: 1.6 }}>{item}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    style={{
                      marginTop: 30,
                      width: "100%",
                      borderRadius: 999,
                      border: plan.featured
                        ? "none"
                        : "1px solid rgba(167,139,250,0.22)",
                      background: plan.featured
                        ? "linear-gradient(90deg, #bfaeff, #8f7cff)"
                        : "rgba(9,7,23,0.8)",
                      color: "#fff",
                      fontWeight: 800,
                      padding: "15px 16px",
                      cursor: "pointer",
                    }}
                  >
                    Get Started
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer style={{ marginTop: "90px", paddingBottom: "48px" }}>
          <div style={{ display: "flex", gap: 18, marginBottom: 22 }}>
            {["f", "◎", "𝕏", "▶"].map((label) => (
              <button
                key={label}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.03)",
                  color: "#fff",
                  fontSize: 22,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 26,
              color: "rgba(255,255,255,0.62)",
            }}
          >
            <div style={{ display: "grid", gap: 14 }}>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Audio Description
              </a>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Investor Relations
              </a>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Legal Notices
              </a>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Help Center
              </a>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Jobs
              </a>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Cookie Preferences
              </a>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Gift Cards
              </a>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Terms of Use
              </a>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Corporate Information
              </a>
            </div>
            <div style={{ display: "grid", gap: 14 }}>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Media Center
              </a>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Privacy
              </a>
              <a href="#" style={{ color: "inherit", textDecoration: "none" }}>
                Contact Us
              </a>
            </div>
          </div>

          <p style={{ marginTop: 26, color: "rgba(255,255,255,0.42)" }}>
            © 2026 Movie Man.
          </p>
        </footer>
      </div>

      <MovieDetailModal
        movie={selectedMovie}
        onClose={() => setSelectedMovie(null)}
        onAddToWatchlist={addMovieToWatchlist}
        onRemoveFromWatchlist={removeMovieFromWatchlist}
        isInWatchlist={selectedMovieInWatchlist}
      />

      <style>{`
        .mini-card {
          position: relative;
          flex-shrink: 0;
          width: 140px;
          cursor: pointer;
          transition: transform 0.2s ease;
        }
        .mini-card:hover {
          transform: translateY(-6px) scale(1.03);
        }
        .mini-card-img {
          position: relative;
          width: 140px;
          height: 200px;
          border-radius: 8px;
          overflow: hidden;
          background: #1a1a2e;
        }
        .mini-card-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .mini-card-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          color: rgba(255,255,255,0.2);
        }
        .mini-card-score {
          position: absolute;
          top: 5px;
          right: 5px;
          background: rgba(0,0,0,0.7);
          color: #ffd700;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .genre-row-wrap {
          margin-bottom: 40px;
        }
        .genre-row-title {
          font-size: 20px;
          font-weight: 700;
          color: #fff;
          margin: 0;
        }
        .genre-see-all {
          font-size: 13px;
          color: #a78bfa;
          text-decoration: none;
          font-weight: 600;
        }
        .genre-see-all:hover { text-decoration: underline; }
        .genre-row-outer {
          position: relative;
        }
        .genre-row-scroll {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          padding: 8px 0 12px;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .genre-row-scroll::-webkit-scrollbar { display: none; }
        .genre-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 5;
          background: rgba(3,0,20,0.88);
          border: 1px solid rgba(255,255,255,0.12);
          color: #fff;
          font-size: 26px;
          width: 36px;
          height: 64px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }
        .genre-arrow:hover { background: rgba(108,99,255,0.5); }
        .genre-arrow.left  { left: -18px; }
        .genre-arrow.right { right: -18px; }
      `}</style>
    </main>
  );
}
