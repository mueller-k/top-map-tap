import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { RecentDashboard } from '../../shared/domain'
import { DASHBOARD_ID_LENGTH, normalizeName } from '../../shared/domain'
import { api, ApiRequestError } from '../api'
import { Turnstile } from '../components/Turnstile'
import { relativeTime } from '../format'

interface ConfigResponse {
  turnstileSiteKey: string
}

export function HomePage() {
  const navigate = useNavigate()
  const [recent, setRecent] = useState<RecentDashboard[]>([])
  const [openValue, setOpenValue] = useState('')
  const [openError, setOpenError] = useState('')
  const [creating, setCreating] = useState(false)
  const [siteKey, setSiteKey] = useState('')

  useEffect(() => {
    void Promise.all([
      api<{ dashboards: RecentDashboard[] }>('/api/session/recent'),
      api<ConfigResponse>('/api/config'),
    ]).then(([recentResponse, config]) => {
      setRecent(recentResponse.dashboards)
      setSiteKey(config.turnstileSiteKey)
    })
  }, [])

  function openDashboard(event: React.FormEvent) {
    event.preventDefault()
    const id = extractDashboardId(openValue)
    if (!id) {
      setOpenError('Enter a full dashboard URL or 12-character dashboard ID.')
      return
    }
    navigate(`/d/${id}`)
  }

  return (
    <div className="home-layout">
      <section className="hero-panel">
        <p className="eyebrow">Friendly daily MapTap leaderboards</p>
        <h1>Paste scores.<br />Crown friends.</h1>
        <p className="lede">
          A tiny shared dashboard for your group’s daily MapTap results—no accounts,
          no setup ceremony.
        </p>
        <form className="open-form" onSubmit={openDashboard}>
          <label htmlFor="dashboard-link">Open a dashboard</label>
          <div className="inline-control">
            <input
              id="dashboard-link"
              value={openValue}
              onChange={(event) => {
                setOpenValue(event.target.value)
                setOpenError('')
              }}
              placeholder="Paste a dashboard URL or ID"
              autoCapitalize="none"
              autoCorrect="off"
            />
            <button className="button primary" type="submit">Open</button>
          </div>
          {openError && <p className="form-error">{openError}</p>}
        </form>
      </section>

      <aside className="home-sidebar">
        <section className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">This browser session</p>
              <h2>Recent dashboards</h2>
            </div>
          </div>
          {recent.length ? (
            <ul className="recent-list">
              {recent.map((dashboard) => (
                <li key={dashboard.id}>
                  <Link to={`/d/${dashboard.id}`}>
                    <span>{dashboard.name}</span>
                    <small>{relativeTime(dashboard.lastAccessedAt)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">Dashboards you unlock will wait here until your browser session ends.</p>
          )}
        </section>

        <section className="card create-card">
          {!creating ? (
            <>
              <p className="eyebrow">Start a group</p>
              <h2>Create a dashboard</h2>
              <p className="muted">Choose a name, password, and time zone. Those settings are permanent.</p>
              <button className="button secondary" onClick={() => setCreating(true)}>
                Create dashboard
              </button>
            </>
          ) : (
            <CreateDashboardForm
              siteKey={siteKey}
              onCancel={() => setCreating(false)}
              onCreated={(id) => navigate(`/d/${id}`)}
            />
          )}
        </section>
      </aside>
    </div>
  )
}

function CreateDashboardForm({
  siteKey,
  onCancel,
  onCreated,
}: {
  siteKey: string
  onCancel: () => void
  onCreated: (id: string) => void
}) {
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [timeZone, setTimeZone] = useState(browserTimeZone)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const timeZones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone')
    } catch {
      return ['UTC', browserTimeZone]
    }
  }, [browserTimeZone])
  const handleToken = useCallback((token: string) => setTurnstileToken(token), [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await api<{ dashboard: { id: string } }>('/api/dashboards', {
        method: 'POST',
        body: JSON.stringify({
          name: normalizeName(name).display,
          password,
          confirmPassword,
          timeZone,
          turnstileToken,
        }),
      })
      onCreated(response.dashboard.id)
    } catch (requestError) {
      setError(requestError instanceof ApiRequestError ? requestError.message : 'Couldn’t create dashboard.')
      setTurnstileToken('')
      setResetKey((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">New dashboard</p>
          <h2>Create your group</h2>
        </div>
        <button type="button" className="text-button" onClick={onCancel}>Close</button>
      </div>
      <label>
        Dashboard name
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required />
      </label>
      <label>
        Shared password
        <input
          type="password"
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
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      <label>
        Time zone
        <input
          list="time-zone-options"
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
          required
        />
        <datalist id="time-zone-options">
          {timeZones.map((zone) => <option key={zone} value={zone} />)}
        </datalist>
      </label>
      {siteKey && <Turnstile siteKey={siteKey} resetKey={resetKey} onToken={handleToken} />}
      {error && <p className="form-error">{error}</p>}
      <button className="button primary" disabled={busy || !turnstileToken}>
        {busy ? 'Creating…' : 'Create dashboard'}
      </button>
    </form>
  )
}

function extractDashboardId(value: string): string | null {
  const trimmed = value.trim()
  const direct = new RegExp(`^[A-Za-z0-9]{${DASHBOARD_ID_LENGTH}}$`)
  if (direct.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    const match = new RegExp(`/d/([A-Za-z0-9]{${DASHBOARD_ID_LENGTH}})$`).exec(url.pathname)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

