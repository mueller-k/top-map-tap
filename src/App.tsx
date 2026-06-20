import { lazy, Suspense } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import "./App.css";

const HomePage = lazy(() =>
  import("./pages/HomePage").then((module) => ({ default: module.HomePage })),
);
const LeaderboardPage = lazy(() =>
  import("./pages/LeaderboardPage").then((module) => ({
    default: module.LeaderboardPage,
  })),
);
const CreateLeaderboardPage = lazy(() =>
  import("./pages/CreateLeaderboardPage").then((module) => ({
    default: module.CreateLeaderboardPage,
  })),
);

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="site-header">
          <Link className="brand" to="/" aria-label="Top Map Tap home">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 48 48">
                <path className="brand-crown" d="M15 12 19 7l5 5 5-5 4 5" />
                <path className="brand-crown" d="M16.5 15h15" />
                <circle cx="24" cy="29" r="12.5" />
                <path d="M11.5 29h25M24 16.5c4 3.5 6 7.7 6 12.5s-2 9-6 12.5M24 16.5c-4 3.5-6 7.7-6 12.5s2 9 6 12.5" />
              </svg>
            </span>
            <span>Top Map Tap</span>
          </Link>
        </header>
        <main>
          <Suspense fallback={<div className="page-loader">Loading…</div>}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/create/*" element={<CreateLeaderboardPage />} />
              <Route path="/d/:leaderboardId" element={<LeaderboardPage />} />
              <Route path="*" element={<Unavailable />} />
            </Routes>
          </Suspense>
        </main>
        <footer>
          Unofficial companion for{" "}
          <a href="https://maptap.gg" target="_blank" rel="noreferrer">
            maptap.gg
          </a>
        </footer>
      </div>
    </BrowserRouter>
  );
}

function Unavailable() {
  return (
    <section className="center-card">
      <p className="eyebrow">Leaderboard unavailable</p>
      <h1>That link doesn’t go anywhere.</h1>
      <p className="muted">Check the shared URL, or head back home.</p>
      <Link className="button primary" to="/">
        Back home
      </Link>
    </section>
  );
}
