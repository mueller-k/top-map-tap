import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RecentLeaderboard } from "../../shared/domain";
import { LEADERBOARD_ID_LENGTH, normalizeName } from "../../shared/domain";
import { api, ApiRequestError } from "../api";
import { Turnstile } from "../components/Turnstile";

interface ConfigResponse {
  turnstileSiteKey: string;
}

export function HomePage() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<RecentLeaderboard[]>([]);
  const [openValue, setOpenValue] = useState("");
  const [openError, setOpenError] = useState("");
  const [creating, setCreating] = useState(false);
  const [siteKey, setSiteKey] = useState("");

  useEffect(() => {
    void Promise.all([
      api<{ leaderboards: RecentLeaderboard[] }>("/api/session/recent"),
      api<ConfigResponse>("/api/config"),
    ]).then(([recentResponse, config]) => {
      setRecent(recentResponse.leaderboards);
      setSiteKey(config.turnstileSiteKey);
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
        {!creating ? (
          <div className="hero-action">
            <button
              className="button primary hero-cta"
              onClick={() => setCreating(true)}
            >
              Create a new leaderboard
              <span aria-hidden="true">→</span>
            </button>
            <p>No account required. Just choose a name and shared password.</p>
          </div>
        ) : (
          <div className="hero-create-form">
            <CreateLeaderboardForm
              siteKey={siteKey}
              onCancel={() => setCreating(false)}
              onCreated={(id) => navigate(`/d/${id}`)}
            />
          </div>
        )}
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

function CreateLeaderboardForm({
  siteKey,
  onCancel,
  onCreated,
}: {
  siteKey: string;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const handleToken = useCallback(
    (token: string) => setTurnstileToken(token),
    [],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api<{ leaderboard: { id: string } }>(
        "/api/leaderboards",
        {
          method: "POST",
          body: JSON.stringify({
            name: normalizeName(name).display,
            password,
            confirmPassword,
            turnstileToken,
          }),
        },
      );
      onCreated(response.leaderboard.id);
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError
          ? requestError.message
          : "Couldn’t create leaderboard.",
      );
      setTurnstileToken("");
      setResetKey((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">New leaderboard</p>
          <h2>Create your leaderboard</h2>
        </div>
        <button type="button" className="text-button" onClick={onCancel}>
          Close
        </button>
      </div>
      <label>
        Leaderboard name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          required
        />
      </label>
      <label>
        Shared password
        <input
          type={showPasswords ? "text" : "password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      <label>
        Confirm password
        <input
          type={showPasswords ? "text" : "password"}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={showPasswords}
          onChange={(event) => setShowPasswords(event.target.checked)}
        />
        Reveal password
      </label>
      {siteKey && (
        <Turnstile
          siteKey={siteKey}
          resetKey={resetKey}
          onToken={handleToken}
        />
      )}
      {error && <p className="form-error">{error}</p>}
      <button className="button primary" disabled={busy || !turnstileToken}>
        {busy ? "Creating…" : "Create leaderboard"}
      </button>
    </form>
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
