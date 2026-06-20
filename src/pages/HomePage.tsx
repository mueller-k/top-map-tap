import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RecentLeaderboard } from "../../shared/domain";
import { LEADERBOARD_ID_LENGTH } from "../../shared/domain";
import { api } from "../api";

export function HomePage() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<RecentLeaderboard[]>([]);
  const [openValue, setOpenValue] = useState("");
  const [openError, setOpenError] = useState("");

  useEffect(() => {
    void api<{ leaderboards: RecentLeaderboard[] }>(
      "/api/session/recent",
    ).then((recentResponse) => {
      setRecent(recentResponse.leaderboards);
    });
  }, []);

  function openLeaderboard(event: React.FormEvent) {
    event.preventDefault();
    const id = extractLeaderboardId(openValue);
    if (!id) {
      setOpenError(
        "Enter a full leaderboard URL or 12-character leaderboard ID.",
      );
      return;
    }
    navigate(`/d/${id}`);
  }

  return (
    <div className="home-page">
      <section className="hero-panel">
        <p className="eyebrow">Free MapTap leaderboards</p>
        <h1>Claim your MapTap crown.</h1>
        <p className="lede">
          A shared leaderboard for your group’s daily MapTap results — no
          account necessary.
        </p>
        <div className="hero-action">
          <Link className="button primary hero-cta" to="/create/details">
            Create a new leaderboard
            <span aria-hidden="true">→</span>
          </Link>
          <p>No account required. Just choose a name and shared password.</p>
        </div>
      </section>

      <section className="your-leaderboards" aria-labelledby="recent-heading">
        <div className="home-section-heading">
          <div>
            <p className="eyebrow">Your leaderboards</p>
            <h2 id="recent-heading">Jump back in</h2>
          </div>
          {recent.length ? (
            <p className="section-note">Recently opened on this device</p>
          ) : null}
        </div>
        {recent.length ? (
          <ul className="recent-list">
            {recent.map((leaderboard) => (
              <li key={leaderboard.id}>
                <Link to={`/d/${leaderboard.id}`}>
                  <span className="recent-leaderboard-details">
                    <span>{leaderboard.name}</span>
                  </span>
                  <span className="recent-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-copy">
            Leaderboards you open will be saved here for next time.
          </p>
        )}
      </section>

      <section className="open-existing" aria-labelledby="open-heading">
        <div>
          <p className="eyebrow">Already have one?</p>
          <h2 id="open-heading">Open an existing leaderboard</h2>
          <p className="muted">Paste the link shared with you, or enter its ID.</p>
        </div>
        <form className="open-form" onSubmit={openLeaderboard}>
          <label className="sr-only" htmlFor="leaderboard-link">
            Leaderboard URL or ID
          </label>
          <div className="inline-control">
            <input
              id="leaderboard-link"
              value={openValue}
              onChange={(event) => {
                setOpenValue(event.target.value);
                setOpenError("");
              }}
              placeholder="Paste a leaderboard URL or ID"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <button className="button ghost" type="submit">
              Open leaderboard
            </button>
          </div>
          {openError && <p className="form-error">{openError}</p>}
        </form>
      </section>
    </div>
  );
}

function extractLeaderboardId(value: string): string | null {
  const trimmed = value.trim();
  const direct = new RegExp(`^[A-Za-z0-9]{${LEADERBOARD_ID_LENGTH}}$`);
  if (direct.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const match = new RegExp(
      `/d/([A-Za-z0-9]{${LEADERBOARD_ID_LENGTH}})$`,
    ).exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
