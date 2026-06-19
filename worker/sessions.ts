import { randomToken, sha256 } from './crypto'

const COOKIE_NAME = 'mtt_session'
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000

export interface Session {
  id: string
  token: string
  expiresAt: string
}

interface SessionRow {
  id: string
  expires_at: string
}

export async function readSession(
  request: Request,
  env: Env,
  refresh = true,
): Promise<Session | null> {
  const token = readCookie(request, COOKIE_NAME)
  if (!token) return null
  const tokenHash = await sha256(token)
  const now = new Date()
  const row = await env.DB.prepare(
    'SELECT id, expires_at FROM sessions WHERE token_hash = ?',
  ).bind(tokenHash).first<SessionRow>()
  if (!row || row.expires_at <= now.toISOString()) {
    if (row) {
      await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(row.id).run()
    }
    return null
  }
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString()
  if (refresh) {
    await env.DB.prepare(
      'UPDATE sessions SET updated_at = ?, expires_at = ? WHERE id = ?',
    ).bind(now.toISOString(), expiresAt, row.id).run()
  }
  return { id: row.id, token, expiresAt: refresh ? expiresAt : row.expires_at }
}

export async function createSession(env: Env): Promise<Session> {
  const now = new Date()
  const session: Session = {
    id: crypto.randomUUID(),
    token: randomToken(),
    expiresAt: new Date(now.getTime() + SESSION_DURATION_MS).toISOString(),
  }
  await env.DB.prepare(
    'INSERT INTO sessions (id, token_hash, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(
    session.id,
    await sha256(session.token),
    now.toISOString(),
    now.toISOString(),
    session.expiresAt,
  ).run()
  return session
}

export async function rotateSession(
  env: Env,
  previous: Session | null,
  leaderboardId: string,
): Promise<Session> {
  const next = await sessionInsertStatement(env)
  const now = new Date().toISOString()
  const statements: D1PreparedStatement[] = [next.statement]
  if (previous) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO session_leaderboards (session_id, leaderboard_id, last_accessed_at)
         SELECT ?, leaderboard_id, last_accessed_at
         FROM session_leaderboards WHERE session_id = ?
         ON CONFLICT (session_id, leaderboard_id)
         DO UPDATE SET last_accessed_at = excluded.last_accessed_at`,
      ).bind(next.session.id, previous.id),
    )
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO session_leaderboards (session_id, leaderboard_id, last_accessed_at)
       VALUES (?, ?, ?)
       ON CONFLICT (session_id, leaderboard_id)
       DO UPDATE SET last_accessed_at = excluded.last_accessed_at`,
    ).bind(next.session.id, leaderboardId, now),
  )
  if (previous) {
    statements.push(env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(previous.id))
  }
  await env.DB.batch(statements)
  return next.session
}

export async function sessionInsertStatement(env: Env): Promise<{
  session: Session
  statement: D1PreparedStatement
}> {
  const now = new Date()
  const session: Session = {
    id: crypto.randomUUID(),
    token: randomToken(),
    expiresAt: new Date(now.getTime() + SESSION_DURATION_MS).toISOString(),
  }
  return {
    session,
    statement: env.DB.prepare(
      'INSERT INTO sessions (id, token_hash, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(
      session.id,
      await sha256(session.token),
      now.toISOString(),
      now.toISOString(),
      session.expiresAt,
    ),
  }
}

export async function hasLeaderboardAccess(
  env: Env,
  sessionId: string,
  leaderboardId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 AS allowed FROM session_leaderboards WHERE session_id = ? AND leaderboard_id = ?',
  ).bind(sessionId, leaderboardId).first<{ allowed: number }>()
  return row?.allowed === 1
}

export function sessionCookie(session: Session, secure: boolean): string {
  return [
    `${COOKIE_NAME}=${session.token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

export function expiredSessionCookie(secure: boolean): string {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get('Cookie')
  if (!cookie) return null
  for (const part of cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

