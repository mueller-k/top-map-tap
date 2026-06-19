import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RecentLeaderboard } from "../../shared/domain";
import { LEADERBOARD_ID_LENGTH, normalizeName } from "../../shared/domain";
import { api, ApiRequestError } from "../api";
import { Turnstile } from "../components/Turnstile";
import { relativeTime } from "../format";

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
    <div className="home-layout">
      <section className="hero-panel">
        <p className="eyebrow">Free MapTap leaderboards</p>
        <h1>
          Claim your MapTap crown.
        </h1>
        <p className="lede">
          A shared leaderboard for your group’s daily MapTap results — no
          account necessary.
        </p>
        <form className="open-form" onSubmit={openLeaderboard}>
          <label htmlFor="leaderboard-link">Have an existing leaderboard link?</label>
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
            <button className="button primary" type="submit">
              Open
            </button>
          </div>
          {openError && <p className="form-error">{openError}</p>}
        </form>
      </section>

      <aside className="home-sidebar">
        <section className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your leaderboards</p>
              <h2>Recent</h2>
            </div>
          </div>
          {recent.length ? (
            <ul className="recent-list">
              {recent.map((leaderboard) => (
                <li key={leaderboard.id}>
                  <Link to={`/d/${leaderboard.id}`}>
                    <span>{leaderboard.name}</span>
                    <small>{relativeTime(leaderboard.lastAccessedAt)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">
              Leaderboards you have accessed will be here.
            </p>
          )}
        </section>

        <section className="card create-card">
          {!creating ? (
            <>
              <p className="eyebrow">Create new leaderboard</p>
              <h2>New</h2>
              <p className="muted">
                Choose a name and password. These settings are permanent.
              </p>
              <button
                className="button secondary"
                onClick={() => setCreating(true)}
              >
                Create leaderboard
              </button>
            </>
          ) : (
            <CreateLeaderboardForm
              siteKey={siteKey}
              onCancel={() => setCreating(false)}
              onCreated={(id) => navigate(`/d/${id}`)}
            />
          )}
        </section>
      </aside>
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
          <h2>Create your group</h2>
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
