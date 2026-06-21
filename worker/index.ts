import {
  LEADERBOARD_ID_LENGTH,
  MAX_PARTICIPANTS,
  isValidName,
  normalizeName,
  parseDateKey,
  type MapTapDate,
  type ParsedResult,
} from '../shared/domain'
import { parseMapTapResult } from '../shared/parser'
import {
  processGroupMeCandidates,
  type ImportSummary,
  type ProcessedGroupMeImport,
} from '../shared/history-import'
import {
  hashPassword,
  randomLeaderboardId,
  sha256,
  verifyPassword,
} from './crypto'
import {
  buildSnapshot,
  currentDate,
  getLeaderboard,
  toResultView,
  type LeaderboardRow,
  type ResultRow,
} from './data'
import {
  expiredSessionCookie,
  hasLeaderboardAccess,
  readSession,
  rotateSession,
  sessionCookie,
  sessionInsertStatement,
  type Session,
} from './sessions'

const JSON_LIMIT = 8 * 1024
const CREATE_JSON_LIMIT = 2 * 1024 * 1024
const GROUPME_CALLBACK_JSON_LIMIT = 8 * 1024
const GROUPME_CALLBACK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const GROUPME_GROUP_ID_PATTERN = /^\d{1,64}$/
const GROUPME_MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const GROUPME_FUTURE_SKEW_MS = 5 * 60 * 1000
const LEADERBOARD_ID_PATTERN = new RegExp(`^[A-Za-z0-9]{${LEADERBOARD_ID_LENGTH}}$`)
const DUMMY_PASSWORD = {
  algorithm: 'PBKDF2-SHA-256' as const,
  iterations: 100_000,
  salt: 'AAAAAAAAAAAAAAAAAAAAAA',
  hash: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    try {
      if (url.pathname.startsWith('/api/')) {
        return await routeApi(request, env, url)
      }
      const response = await env.ASSETS.fetch(request)
      return withSecurityHeaders(response, url)
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonError(error.code, error.message, error.status, url)
      }
      console.error(JSON.stringify({
        message: 'request failed',
        method: request.method,
        path: safeLogPath(url.pathname),
        error: error instanceof Error ? error.message : String(error),
      }))
      return jsonError('INTERNAL_ERROR', 'Something went wrong. Try again.', 500, url)
    }
  },
} satisfies ExportedHandler<Env>

async function routeApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return json({ status: 'ok' }, 200, url)
  }
  if (request.method === 'GET' && url.pathname === '/api/config') {
    return json({
      turnstileSiteKey: env.TURNSTILE_SITE_KEY,
      turnstileRequired: !isLocalDevelopmentHost(url.hostname),
    }, 200, url)
  }
  if (request.method === 'GET' && url.pathname === '/api/session/recent') {
    const session = await readSession(request, env)
    if (!session) return json({ leaderboards: [] }, 200, url, expiredSessionCookie(url.protocol === 'https:'))
    const rows = await env.DB.prepare(
      `SELECT d.id, d.name, sd.last_accessed_at
       FROM session_leaderboards sd
       JOIN leaderboards d ON d.id = sd.leaderboard_id
       WHERE sd.session_id = ?
       ORDER BY sd.last_accessed_at DESC LIMIT 5`,
    ).bind(session.id).all<{ id: string; name: string; last_accessed_at: string }>()
    return json({
      leaderboards: rows.results.map((row) => ({
        id: row.id,
        name: row.name,
        lastAccessedAt: row.last_accessed_at,
      })),
    }, 200, url)
  }
  if (request.method === 'POST' && url.pathname === '/api/leaderboards') {
    assertMutationRequest(request, url)
    return createLeaderboard(request, env, url)
  }
  const groupMeCallback = /^\/api\/groupme-callbacks\/([^/]+)$/.exec(url.pathname)
  if (request.method === 'POST' && groupMeCallback) {
    return receiveGroupMeCallback(
      request,
      env,
      url,
      groupMeCallback[1],
    )
  }

  const match = /^\/api\/leaderboards\/([^/]+)(?:\/(.*))?$/.exec(url.pathname)
  if (!match || !LEADERBOARD_ID_PATTERN.test(match[1])) {
    return jsonError('LEADERBOARD_UNAVAILABLE', 'Leaderboard unavailable.', 404, url)
  }
  const leaderboardId = match[1]
  const action = match[2] ?? ''

  if (request.method === 'POST' && action === 'unlock') {
    assertMutationRequest(request, url)
    return unlockLeaderboard(request, env, url, leaderboardId)
  }
  if (request.method === 'POST' && action === 'share/verify') {
    assertMutationRequest(request, url)
    const authorized = await requireAccess(request, env, leaderboardId, url)
    if (authorized instanceof Response) return authorized
    return verifySharePassword(request, env, url, authorized.leaderboard)
  }

  const authorized = await requireAccess(request, env, leaderboardId, url)
  if (authorized instanceof Response) return authorized

  if (request.method === 'GET' && action === 'bootstrap') {
    const requestedDate = parseDateKey(url.searchParams.get('date') ?? '')
    const today = currentDate()
    const leaderboardDate =
      requestedDate?.isCalendarDate && compareDateParts(requestedDate, today) <= 0
        ? requestedDate
        : undefined
    const historyDays = url.searchParams.get('days') === '30' ? 30 : 7
    if (url.searchParams.get('touch') === '1') {
      await env.DB.prepare(
        'UPDATE session_leaderboards SET last_accessed_at = ? WHERE session_id = ? AND leaderboard_id = ?',
      ).bind(new Date().toISOString(), authorized.session.id, leaderboardId).run()
    }
    return json(
      await buildSnapshot(env, authorized.leaderboard, historyDays, leaderboardDate),
      200,
      url,
    )
  }
  if (request.method === 'GET' && action === 'leaderboard') {
    const date = parseDateKey(url.searchParams.get('date') ?? '')
    if (!date?.isCalendarDate) {
      return jsonError('INVALID_DATE', 'Choose a valid calendar date.', 400, url)
    }
    const snapshot = await buildSnapshot(env, authorized.leaderboard, 7, date)
    return json({ leaderboard: snapshot.dailyLeaderboard }, 200, url)
  }
  if (request.method === 'GET' && action === 'history') {
    const days = url.searchParams.get('days') === '30' ? 30 : 7
    const snapshot = await buildSnapshot(env, authorized.leaderboard, days)
    return json({ history: snapshot.history, historyDays: days }, 200, url)
  }
  if (request.method === 'GET' && action === 'personal-bests') {
    const snapshot = await buildSnapshot(env, authorized.leaderboard)
    return json({ personalBests: snapshot.personalBests }, 200, url)
  }
  if (request.method === 'GET' && action === 'personal-worsts') {
    const snapshot = await buildSnapshot(env, authorized.leaderboard)
    return json({ personalWorsts: snapshot.personalWorsts }, 200, url)
  }
  if (request.method === 'POST' && action === 'results') {
    assertMutationRequest(request, url)
    return submitResult(request, env, url, authorized.leaderboard)
  }
  return jsonError('NOT_FOUND', 'Not found.', 404, url)
}

async function createLeaderboard(request: Request, env: Env, url: URL): Promise<Response> {
  const ip = clientIp(request)
  const limit = await env.CREATE_RATE_LIMIT.limit({ key: ip })
  if (!limit.success) return jsonError('RATE_LIMITED', 'Try again shortly.', 429, url)
  const body = await readJson(request, CREATE_JSON_LIMIT)
  const name = stringField(body, 'name')
  const password = stringField(body, 'password')
  const confirmPassword = stringField(body, 'confirmPassword')
  const turnstileToken = stringField(body, 'turnstileToken')
  const importSource = stringField(body, 'importSource')
  const groupMeLiveImport = body.groupMeLiveImport === true
  const groupMeGroupId = stringField(body, 'groupMeGroupId')
  const groupMeCallbackToken = stringField(body, 'groupMeCallbackToken')
  if (!isValidName(name, 60)) {
    return jsonError('INVALID_NAME', 'Leaderboard name must be 1–60 characters.', 400, url)
  }
  if (
    password !== confirmPassword ||
    Array.from(password).length < 8 ||
    Array.from(password).length > 128
  ) {
    return jsonError('INVALID_PASSWORD', 'Passwords must match and be 8–128 characters.', 400, url)
  }
  if (importSource !== 'none' && importSource !== 'groupme') {
    return jsonError(
      'INVALID_IMPORT_SOURCE',
      'Choose a valid import source.',
      400,
      url,
    )
  }
  let imported: ProcessedGroupMeImport | null = null
  if (importSource === 'none') {
    if (
      'importCandidates' in body ||
      'importSummary' in body ||
      groupMeLiveImport ||
      'groupMeGroupId' in body ||
      'groupMeCallbackToken' in body
    ) {
      return jsonError('INVALID_IMPORT', 'Invalid history import.', 400, url)
    }
  } else {
    const candidates = body.importCandidates
    const expectedSummary = body.importSummary
    if (!Array.isArray(candidates) || !isImportSummary(expectedSummary)) {
      return jsonError('INVALID_IMPORT', 'Invalid history import.', 400, url)
    }
    const processed = processGroupMeCandidates(candidates)
    if (!processed.ok) {
      return importError(processed.code, url)
    }
    if (!sameImportSummary(processed.value.summary, expectedSummary)) {
      return jsonError(
        'IMPORT_PREVIEW_MISMATCH',
        'History import changed. Review the export again.',
        409,
        url,
      )
    }
    imported = processed.value
    if (groupMeLiveImport) {
      if (
        !GROUPME_GROUP_ID_PATTERN.test(groupMeGroupId) ||
        !GROUPME_CALLBACK_TOKEN_PATTERN.test(groupMeCallbackToken)
      ) {
        return jsonError(
          'INVALID_GROUPME_LIVE_IMPORT',
          'Enter a valid GroupMe group ID.',
          400,
          url,
        )
      }
    } else if ('groupMeGroupId' in body || 'groupMeCallbackToken' in body) {
      return jsonError('INVALID_GROUPME_LIVE_IMPORT', 'Invalid GroupMe live import.', 400, url)
    }
  }
  if (!isLocalDevelopmentHost(url.hostname)) {
    const turnstile = await verifyTurnstile(request, env, turnstileToken)
    if (!turnstile) {
      return jsonError('TURNSTILE_FAILED', 'Verification expired. Please try again.', 400, url)
    }
  }

  const leaderboardId = randomLeaderboardId()
  const cleanedName = normalizeName(name).display
  const passwordHash = await hashPassword(password)
  const callbackTokenHash = groupMeLiveImport
    ? await sha256(groupMeCallbackToken)
    : null
  const now = new Date().toISOString()
  const existingSession = await readSession(request, env)
  const sessionInsert = existingSession ? null : await sessionInsertStatement(env)
  const session = existingSession ?? sessionInsert!.session
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO leaderboards
       (id, name, password_algorithm, password_iterations, password_salt,
        password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      leaderboardId,
      cleanedName,
      passwordHash.algorithm,
      passwordHash.iterations,
      passwordHash.salt,
      passwordHash.hash,
      now,
    ),
  ]
  if (sessionInsert) statements.push(sessionInsert.statement)
  statements.push(
    env.DB.prepare(
      'INSERT INTO session_leaderboards (session_id, leaderboard_id, last_accessed_at) VALUES (?, ?, ?)',
    ).bind(session.id, leaderboardId, now),
  )
  if (imported) {
    statements.push(...importStatements(env, leaderboardId, imported))
  }
  if (callbackTokenHash) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO groupme_live_imports
         (id, leaderboard_id, callback_token_hash, group_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        leaderboardId,
        callbackTokenHash,
        groupMeGroupId,
        now,
      ),
    )
  }
  await env.DB.batch(statements)
  return json(
    { leaderboard: { id: leaderboardId, name: cleanedName } },
    201,
    url,
    sessionInsert ? sessionCookie(session, url.protocol === 'https:') : undefined,
  )
}

interface GroupMeLiveImportRow {
  id: string
  leaderboard_id: string
  group_id: string
}

interface AcceptedGroupMeSubmission {
  messageId: string
  participantDisplayName: string
  participantNormalizedName: string
  submissionTime: string
  parsed: ParsedResult
}

async function receiveGroupMeCallback(
  request: Request,
  env: Env,
  url: URL,
  callbackToken: string,
): Promise<Response> {
  if (!GROUPME_CALLBACK_TOKEN_PATTERN.test(callbackToken)) {
    return jsonError('NOT_FOUND', 'Not found.', 404, url)
  }
  const callbackTokenHash = await sha256(callbackToken)
  const tokenLimit = await env.GROUPME_CALLBACK_RATE_LIMIT.limit({
    key: `token:${callbackTokenHash}`,
  })
  const integration = await env.DB.prepare(
    `SELECT id, leaderboard_id, group_id
     FROM groupme_live_imports WHERE callback_token_hash = ?`,
  ).bind(callbackTokenHash).first<GroupMeLiveImportRow>()
  if (!integration) return jsonError('NOT_FOUND', 'Not found.', 404, url)
  if (!tokenLimit.success) return noContent(url)

  const ipLimit = await env.GROUPME_CALLBACK_RATE_LIMIT.limit({
    key: `ip:${clientIp(request)}`,
  })
  if (!ipLimit.success) return noContent(url)
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return noContent(url)
  }

  let body: Record<string, unknown>
  try {
    body = await readJson(request, GROUPME_CALLBACK_JSON_LIMIT)
  } catch (error) {
    if (error instanceof HttpError) return noContent(url)
    throw error
  }
  const submission = acceptedGroupMeSubmission(
    body,
    integration.group_id,
    new Date(),
  )
  if (!submission) return noContent(url)

  const received = await env.DB.prepare(
    `SELECT 1 AS received FROM groupme_message_receipts
     WHERE integration_id = ? AND message_id = ?`,
  ).bind(integration.id, submission.messageId).first<{ received: number }>()
  if (received) return noContent(url)

  const receivedAt = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO participants
       (id, leaderboard_id, display_name, normalized_name, created_at)
       SELECT ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM participants WHERE leaderboard_id = ?) < ?`,
    ).bind(
      crypto.randomUUID(),
      integration.leaderboard_id,
      submission.participantDisplayName,
      submission.participantNormalizedName,
      submission.submissionTime,
      integration.leaderboard_id,
      MAX_PARTICIPANTS,
    ),
    resultUpsertStatement(env, {
      leaderboardId: integration.leaderboard_id,
      participantNormalizedName: submission.participantNormalizedName,
      parsed: submission.parsed,
      submissionTime: submission.submissionTime,
      submissionSource: 'groupme',
      groupMeMessageId: submission.messageId,
      writtenAt: receivedAt,
      receiptGuard: {
        integrationId: integration.id,
        messageId: submission.messageId,
      },
    }),
    env.DB.prepare(
      `INSERT OR IGNORE INTO groupme_message_receipts
       (integration_id, message_id, received_at) VALUES (?, ?, ?)`,
    ).bind(integration.id, submission.messageId, receivedAt),
  ])
  return noContent(url)
}

export function acceptedGroupMeSubmission(
  body: Record<string, unknown>,
  expectedGroupId: string,
  now: Date,
): AcceptedGroupMeSubmission | null {
  if (
    body.system !== false ||
    body.sender_type !== 'user' ||
    body.group_id !== expectedGroupId ||
    typeof body.id !== 'string' ||
    !GROUPME_MESSAGE_ID_PATTERN.test(body.id) ||
    typeof body.name !== 'string' ||
    !isValidName(body.name, 30) ||
    typeof body.text !== 'string' ||
    typeof body.created_at !== 'number' ||
    !Number.isSafeInteger(body.created_at)
  ) {
    return null
  }
  const timestamp = new Date(body.created_at * 1000)
  if (
    !Number.isFinite(timestamp.getTime()) ||
    timestamp.getUTCFullYear() < 2000 ||
    timestamp.getTime() > now.getTime() + GROUPME_FUTURE_SKEW_MS
  ) {
    return null
  }
  const parsed = parseMapTapResult(
    body.text,
    timestamp.getUTCFullYear(),
    now.getUTCFullYear(),
  )
  if (!parsed.ok) return null
  const participant = normalizeName(body.name)
  return {
    messageId: body.id,
    participantDisplayName: participant.display,
    participantNormalizedName: participant.normalized,
    submissionTime: timestamp.toISOString(),
    parsed: parsed.value,
  }
}

async function unlockLeaderboard(
  request: Request,
  env: Env,
  url: URL,
  leaderboardId: string,
): Promise<Response> {
  const body = await readJson(request)
  const password = stringField(body, 'password')
  const leaderboard = await getLeaderboard(env, leaderboardId)
  const valid = await verifyPassword(password, leaderboard ? passwordRecord(leaderboard) : DUMMY_PASSWORD)
  if (!leaderboard || !valid) {
    const rate = await env.PASSWORD_RATE_LIMIT.limit({ key: `${leaderboardId}:${clientIp(request)}` })
    return rate.success
      ? jsonError('UNLOCK_FAILED', 'Couldn’t unlock leaderboard.', 401, url)
      : jsonError('RATE_LIMITED', 'Too many attempts. Try again shortly.', 429, url)
  }
  const previous = await readSession(request, env, false)
  const session = await rotateSession(env, previous, leaderboardId)
  return json(
    { unlocked: true },
    200,
    url,
    sessionCookie(session, url.protocol === 'https:'),
  )
}

async function verifySharePassword(
  request: Request,
  env: Env,
  url: URL,
  leaderboard: LeaderboardRow,
): Promise<Response> {
  const body = await readJson(request)
  const password = stringField(body, 'password')
  if (!(await verifyPassword(password, passwordRecord(leaderboard)))) {
    const rate = await env.PASSWORD_RATE_LIMIT.limit({
      key: `${leaderboard.id}:${clientIp(request)}`,
    })
    return rate.success
      ? jsonError('VERIFY_FAILED', 'Couldn’t verify password.', 401, url)
      : jsonError('RATE_LIMITED', 'Too many attempts. Try again shortly.', 429, url)
  }
  return json({ verified: true }, 200, url)
}

async function submitResult(
  request: Request,
  env: Env,
  url: URL,
  leaderboard: LeaderboardRow,
): Promise<Response> {
  const limit = await env.SUBMIT_RATE_LIMIT.limit({ key: clientIp(request) })
  if (!limit.success) return jsonError('RATE_LIMITED', 'Try again shortly.', 429, url)
  const body = await readJson(request)
  const sourceText = stringField(body, 'sourceText')
  const participantId = optionalStringField(body, 'participantId')
  const newParticipantName = optionalStringField(body, 'newParticipantName')
  const forceReplace = body.forceReplace === true
  const historyDays = body.historyDays === 30 ? 30 : 7
  if ((participantId ? 1 : 0) + (newParticipantName ? 1 : 0) !== 1) {
    return jsonError('INVALID_PARTICIPANT', 'Choose or create one participant.', 400, url)
  }
  const today = currentDate()
  const parsed = parseMapTapResult(sourceText, today.year)
  if (!parsed.ok) return jsonError(parsed.code, parsed.message, 400, url)

  const participant = await resolveParticipant(
    env,
    leaderboard.id,
    participantId,
    newParticipantName,
  )
  if ('error' in participant) return jsonError(participant.error, participant.message, 400, url)

  const existing = participant.id
    ? await findExistingResult(env, leaderboard.id, participant.id, parsed.value)
    : null
  const scoresMatch = existing ? sameScores(existing, parsed.value) : false
  if (existing && !scoresMatch && !forceReplace) {
    return json({
      error: { code: 'REPLACEMENT_REQUIRED', message: 'Confirm replacement.' },
      existing: toResultView(existing),
    }, 409, url)
  }

  const now = new Date().toISOString()
  const statements: D1PreparedStatement[] = []
  if (!participant.id) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO participants
         (id, leaderboard_id, display_name, normalized_name, created_at)
         SELECT ?, ?, ?, ?, ?
         WHERE (SELECT COUNT(*) FROM participants WHERE leaderboard_id = ?) < ?`,
      ).bind(
        crypto.randomUUID(),
        leaderboard.id,
        participant.display,
        participant.normalized,
        now,
        leaderboard.id,
        MAX_PARTICIPANTS,
      ),
    )
  }
  statements.push(
    resultUpsertStatement(env, {
      leaderboardId: leaderboard.id,
      participantNormalizedName: participant.normalized,
      parsed: parsed.value,
      submissionTime: now,
      submissionSource: 'direct',
      groupMeMessageId: null,
      writtenAt: now,
    }),
  )
  await env.DB.batch(statements)
  const actualParticipant = await env.DB.prepare(
    'SELECT id FROM participants WHERE leaderboard_id = ? AND normalized_name = ?',
  ).bind(leaderboard.id, participant.normalized).first<{ id: string }>()
  if (!actualParticipant) {
    return jsonError('PARTICIPANT_LIMIT', 'Participant limit reached.', 400, url)
  }
  return json({
    status: existing ? (scoresMatch ? 'unchanged' : 'replaced') : 'created',
    snapshot: await buildSnapshot(
      env,
      leaderboard,
      historyDays,
      visibleLeaderboardDate(parsed.value.date, today),
    ),
  }, 200, url)
}

async function resolveParticipant(
  env: Env,
  leaderboardId: string,
  participantId: string | null,
  newName: string | null,
): Promise<
  | { id: string; display: string; normalized: string }
  | { id: null; display: string; normalized: string }
  | { error: string; message: string }
> {
  if (participantId) {
    const row = await env.DB.prepare(
      'SELECT id, display_name, normalized_name FROM participants WHERE id = ? AND leaderboard_id = ?',
    ).bind(participantId, leaderboardId).first<{
      id: string
      display_name: string
      normalized_name: string
    }>()
    return row
      ? { id: row.id, display: row.display_name, normalized: row.normalized_name }
      : { error: 'INVALID_PARTICIPANT', message: 'Choose a valid participant.' }
  }
  if (!newName || !isValidName(newName, 30)) {
    return { error: 'INVALID_PARTICIPANT', message: 'Participant name must be 1–30 characters.' }
  }
  const name = normalizeName(newName)
  const existing = await env.DB.prepare(
    'SELECT id, display_name FROM participants WHERE leaderboard_id = ? AND normalized_name = ?',
  ).bind(leaderboardId, name.normalized).first<{ id: string; display_name: string }>()
  if (existing) return { id: existing.id, display: existing.display_name, normalized: name.normalized }
  const count = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM participants WHERE leaderboard_id = ?',
  ).bind(leaderboardId).first<{ count: number }>()
  if ((count?.count ?? 0) >= MAX_PARTICIPANTS) {
    return { error: 'PARTICIPANT_LIMIT', message: 'Participant limit reached.' }
  }
  return { id: null, ...name }
}

async function findExistingResult(
  env: Env,
  leaderboardId: string,
  participantId: string,
  parsed: ParsedResult,
): Promise<ResultRow | null> {
  return env.DB.prepare(
    `SELECT r.id, r.participant_id, p.display_name, r.result_year, r.result_month,
            r.result_day, r.is_calendar_date, r.round_1, r.round_2, r.round_3,
            r.round_4, r.round_5, r.final_score, r.submission_time,
            r.submission_source, r.groupme_message_id, r.created_at, r.updated_at
     FROM results r JOIN participants p ON p.id = r.participant_id
     WHERE r.leaderboard_id = ? AND r.participant_id = ?
       AND r.result_year = ? AND r.result_month = ? AND r.result_day = ?`,
  ).bind(
    leaderboardId,
    participantId,
    parsed.date.year,
    parsed.date.month,
    parsed.date.day,
  ).first<ResultRow>()
}

function sameScores(row: ResultRow, parsed: ParsedResult): boolean {
  return row.final_score === parsed.finalScore &&
    [row.round_1, row.round_2, row.round_3, row.round_4, row.round_5]
      .every((score, index) => score === parsed.roundScores[index])
}

interface ResultSubmission {
  leaderboardId: string
  participantNormalizedName: string
  parsed: ParsedResult
  submissionTime: string
  submissionSource: 'direct' | 'groupme'
  groupMeMessageId: string | null
  writtenAt: string
  receiptGuard?: {
    integrationId: string
    messageId: string
  }
}

function resultUpsertStatement(
  env: Env,
  submission: ResultSubmission,
): D1PreparedStatement {
  const receiptGuard = submission.receiptGuard
    ? `AND NOT EXISTS (
         SELECT 1 FROM groupme_message_receipts
         WHERE integration_id = ? AND message_id = ?
       )`
    : ''
  const statement = env.DB.prepare(
    `INSERT INTO results
     (id, leaderboard_id, participant_id, result_year, result_month, result_day,
      is_calendar_date, round_1, round_2, round_3, round_4, round_5,
      final_score, source_text, submission_time, submission_source,
      groupme_message_id, created_at, updated_at)
     SELECT ?, ?, p.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     FROM participants p
     WHERE p.leaderboard_id = ? AND p.normalized_name = ?
     ${receiptGuard}
     ON CONFLICT (leaderboard_id, participant_id, result_year, result_month, result_day)
     DO UPDATE SET
       is_calendar_date = excluded.is_calendar_date,
       round_1 = excluded.round_1,
       round_2 = excluded.round_2,
       round_3 = excluded.round_3,
       round_4 = excluded.round_4,
       round_5 = excluded.round_5,
       final_score = excluded.final_score,
       source_text = excluded.source_text,
       submission_time = excluded.submission_time,
       submission_source = excluded.submission_source,
       groupme_message_id = excluded.groupme_message_id,
       updated_at = excluded.updated_at
     WHERE excluded.submission_time > results.submission_time
        OR (
          excluded.submission_time = results.submission_time
          AND excluded.submission_source = 'direct'
          AND results.submission_source <> 'direct'
        )`,
  )
  const values: unknown[] = [
    crypto.randomUUID(),
    submission.leaderboardId,
    submission.parsed.date.year,
    submission.parsed.date.month,
    submission.parsed.date.day,
    submission.parsed.date.isCalendarDate ? 1 : 0,
    ...submission.parsed.roundScores,
    submission.parsed.finalScore,
    submission.parsed.sourceText,
    submission.submissionTime,
    submission.submissionSource,
    submission.groupMeMessageId,
    submission.submissionTime,
    submission.writtenAt,
    submission.leaderboardId,
    submission.participantNormalizedName,
  ]
  if (submission.receiptGuard) {
    values.push(
      submission.receiptGuard.integrationId,
      submission.receiptGuard.messageId,
    )
  }
  return statement.bind(...values)
}

async function requireAccess(
  request: Request,
  env: Env,
  leaderboardId: string,
  url: URL,
): Promise<{ session: Session; leaderboard: LeaderboardRow } | Response> {
  const session = await readSession(request, env)
  if (!session || !(await hasLeaderboardAccess(env, session.id, leaderboardId))) {
    return jsonError(
      'ACCESS_REQUIRED',
      'Enter the leaderboard password.',
      401,
      url,
      session ? undefined : expiredSessionCookie(url.protocol === 'https:'),
    )
  }
  const leaderboard = await getLeaderboard(env, leaderboardId)
  if (!leaderboard) return jsonError('LEADERBOARD_UNAVAILABLE', 'Leaderboard unavailable.', 404, url)
  return { session, leaderboard }
}

async function verifyTurnstile(
  request: Request,
  env: Env,
  token: string,
): Promise<boolean> {
  if (!token) return false
  const form = new FormData()
  form.set('secret', env.TURNSTILE_SECRET_KEY)
  form.set('response', token)
  form.set('remoteip', clientIp(request))
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  })
  if (!response.ok) return false
  const payload: unknown = await response.json()
  if (!isRecord(payload) || payload.success !== true) return false
  const action = typeof payload.action === 'string' ? payload.action : ''
  const hostname = typeof payload.hostname === 'string' ? payload.hostname : ''
  const requestHostname = new URL(request.url).hostname
  return (!action || action === env.TURNSTILE_EXPECTED_ACTION) &&
    (!hostname || hostname === requestHostname)
}

export function isLocalDevelopmentHost(hostname: string): boolean {
  return hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname === '[::1]'
}

function passwordRecord(leaderboard: LeaderboardRow) {
  return {
    algorithm: leaderboard.password_algorithm,
    iterations: leaderboard.password_iterations,
    salt: leaderboard.password_salt,
    hash: leaderboard.password_hash,
  }
}

function assertMutationRequest(request: Request, url: URL): void {
  const origin = request.headers.get('Origin')
  if (origin && origin !== url.origin) throw new HttpError(403, 'CROSS_ORIGIN', 'Request blocked.')
  if (request.headers.get('X-Map-Tap-Request') !== '1') {
    throw new HttpError(403, 'CSRF_BLOCKED', 'Request blocked.')
  }
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'CONTENT_TYPE', 'Expected JSON.')
  }
}

async function readJson(
  request: Request,
  limit = JSON_LIMIT,
): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('Content-Length') ?? 0)
  if (length > limit) throw new HttpError(413, 'BODY_TOO_LARGE', 'Request is too large.')
  if (!request.body) return {}
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let bytesRead = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytesRead += value.byteLength
    if (bytesRead > limit) {
      await reader.cancel()
      throw new HttpError(413, 'BODY_TOO_LARGE', 'Request is too large.')
    }
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  try {
    const value: unknown = JSON.parse(text)
    if (!isRecord(value)) throw new Error('not an object')
    return value
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Invalid JSON.')
  }
}

function isImportSummary(value: unknown): value is ImportSummary {
  if (!isRecord(value) || !Number.isSafeInteger(value.resultCount)) return false
  if (
    !Array.isArray(value.participantNames) ||
    !value.participantNames.every((name) => typeof name === 'string')
  ) {
    return false
  }
  if (value.dateRange === null) return true
  if (!isRecord(value.dateRange)) return false
  return isDateParts(value.dateRange.earliest) && isDateParts(value.dateRange.latest)
}

function isDateParts(
  value: unknown,
): value is { year: number; month: number; day: number } {
  return isRecord(value) &&
    Number.isSafeInteger(value.year) &&
    Number.isSafeInteger(value.month) &&
    Number.isSafeInteger(value.day)
}

function sameImportSummary(
  actual: ImportSummary,
  expected: ImportSummary,
): boolean {
  return actual.resultCount === expected.resultCount &&
    actual.participantNames.length === expected.participantNames.length &&
    actual.participantNames.every(
      (name, index) => name === expected.participantNames[index],
    ) &&
    sameDateRange(actual.dateRange, expected.dateRange)
}

function sameDateRange(
  actual: ImportSummary['dateRange'],
  expected: ImportSummary['dateRange'],
): boolean {
  if (actual === null || expected === null) return actual === expected
  return sameDateParts(actual.earliest, expected.earliest) &&
    sameDateParts(actual.latest, expected.latest)
}

function sameDateParts(
  actual: { year: number; month: number; day: number },
  expected: { year: number; month: number; day: number },
): boolean {
  return actual.year === expected.year &&
    actual.month === expected.month &&
    actual.day === expected.day
}

function importError(
  code: 'INVALID_IMPORT' | 'NO_RESULTS' | 'TOO_MANY_RESULTS' | 'TOO_MANY_PARTICIPANTS',
  url: URL,
): Response {
  if (code === 'NO_RESULTS') {
    return jsonError('NO_IMPORT_RESULTS', 'No MapTap Results found.', 400, url)
  }
  if (code === 'TOO_MANY_RESULTS') {
    return jsonError('IMPORT_RESULT_LIMIT', 'History import exceeds 250 Results.', 400, url)
  }
  if (code === 'TOO_MANY_PARTICIPANTS') {
    return jsonError(
      'IMPORT_PARTICIPANT_LIMIT',
      'History import exceeds 25 Participants.',
      400,
      url,
    )
  }
  return jsonError('INVALID_IMPORT', 'Invalid history import.', 400, url)
}

function importStatements(
  env: Env,
  leaderboardId: string,
  imported: ProcessedGroupMeImport,
): D1PreparedStatement[] {
  const participantIds = new Map<string, string>()
  const participantRows = imported.participants.map((participant) => {
    const id = crypto.randomUUID()
    participantIds.set(participant.normalizedName, id)
    return [
      id,
      leaderboardId,
      participant.displayName,
      participant.normalizedName,
      participant.createdAt,
    ]
  })
  const resultRows = imported.results.map((result) => [
    crypto.randomUUID(),
    leaderboardId,
    participantIds.get(result.participantNormalizedName)!,
    result.date.year,
    result.date.month,
    result.date.day,
    result.date.isCalendarDate ? 1 : 0,
    ...result.roundScores,
    result.finalScore,
    result.sourceText,
    result.createdAt,
  ])

  return [
    ...chunkedInsertStatements(
      env,
      `INSERT INTO participants
       (id, leaderboard_id, display_name, normalized_name, created_at) VALUES `,
      participantRows,
      20,
    ),
    ...importResultStatements(env, resultRows),
  ]
}

function importResultStatements(
  env: Env,
  rows: unknown[][],
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = []
  const columns = [
    'id',
    'leaderboard_id',
    'participant_id',
    'result_year',
    'result_month',
    'result_day',
    'is_calendar_date',
    'round_1',
    'round_2',
    'round_3',
    'round_4',
    'round_5',
    'final_score',
    'source_text',
    'submission_time',
  ]
  for (let index = 0; index < rows.length; index += 6) {
    const chunk = rows.slice(index, index + 6)
    const placeholders = chunk.map(
      (row) => `(${row.map(() => '?').join(', ')})`,
    ).join(', ')
    statements.push(
      env.DB.prepare(
        `WITH imported (${columns.join(', ')}) AS (VALUES ${placeholders})
         INSERT INTO results
         (id, leaderboard_id, participant_id, result_year, result_month, result_day,
          is_calendar_date, round_1, round_2, round_3, round_4, round_5,
          final_score, source_text, submission_time, submission_source,
          groupme_message_id, created_at, updated_at)
         SELECT id, leaderboard_id, participant_id, result_year, result_month,
          result_day, is_calendar_date, round_1, round_2, round_3, round_4,
          round_5, final_score, source_text, submission_time, 'groupme', NULL,
          submission_time, submission_time
         FROM imported`,
      ).bind(...chunk.flat()),
    )
  }
  return statements
}

function chunkedInsertStatements(
  env: Env,
  prefix: string,
  rows: unknown[][],
  chunkSize: number,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = []
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize)
    const placeholders = chunk.map(
      (row) => `(${row.map(() => '?').join(', ')})`,
    ).join(', ')
    statements.push(
      env.DB.prepare(prefix + placeholders).bind(...chunk.flat()),
    )
  }
  return statements
}

function stringField(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === 'string' ? body[key] : ''
}

function optionalStringField(body: Record<string, unknown>, key: string): string | null {
  const value = body[key]
  return typeof value === 'string' && value ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'local'
}

function visibleLeaderboardDate(
  date: MapTapDate,
  currentDate: MapTapDate,
): MapTapDate | undefined {
  return date.isCalendarDate && compareDateParts(date, currentDate) <= 0 ? date : undefined
}

function compareDateParts(left: MapTapDate, right: MapTapDate): number {
  return left.year - right.year || left.month - right.month || left.day - right.day
}

function json(
  value: unknown,
  status: number,
  url: URL,
  cookie?: string,
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  if (cookie) headers.set('Set-Cookie', cookie)
  return withSecurityHeaders(new Response(JSON.stringify(value), { status, headers }), url)
}

function jsonError(
  code: string,
  message: string,
  status: number,
  url: URL,
  cookie?: string,
): Response {
  return json({ error: { code, message } }, status, url, cookie)
}

function noContent(url: URL): Response {
  return withSecurityHeaders(
    new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    }),
    url,
  )
}

function safeLogPath(pathname: string): string {
  return pathname.startsWith('/api/groupme-callbacks/')
    ? '/api/groupme-callbacks/[redacted]'
    : pathname
}

function withSecurityHeaders(response: Response, url: URL): Response {
  const next = new Response(response.body, response)
  next.headers.set('X-Content-Type-Options', 'nosniff')
  next.headers.set('Referrer-Policy', 'no-referrer')
  next.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "font-src 'self'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  )
  if (url.protocol === 'https:') {
    next.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  return next
}

class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message)
    this.status = status
    this.code = code
  }
}
