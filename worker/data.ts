import {
  compareDates,
  dateKey,
  dateRange,
  type LeaderboardSnapshot,
  type MapTapDate,
  type Participant,
  type ResultView,
} from '../shared/domain'
import {
  buildLeaderboard,
  buildPersonalBests,
  buildPersonalWorsts,
} from '../shared/rankings'

export interface LeaderboardRow {
  id: string
  name: string
  password_algorithm: 'PBKDF2-SHA-256'
  password_iterations: number
  password_salt: string
  password_hash: string
}

interface ParticipantRow {
  id: string
  display_name: string
}

export interface ResultRow {
  id: string
  participant_id: string
  display_name: string
  result_year: number
  result_month: number
  result_day: number
  is_calendar_date: number
  round_1: number
  round_2: number
  round_3: number
  round_4: number
  round_5: number
  final_score: number
  created_at: string
  updated_at: string
}

export async function getLeaderboard(
  env: Env,
  leaderboardId: string,
): Promise<LeaderboardRow | null> {
  return env.DB.prepare(
    `SELECT id, name, password_algorithm, password_iterations,
            password_salt, password_hash
     FROM leaderboards WHERE id = ?`,
  ).bind(leaderboardId).first<LeaderboardRow>()
}

export async function getParticipants(
  env: Env,
  leaderboardId: string,
): Promise<Participant[]> {
  const rows = await env.DB.prepare(
    'SELECT id, display_name FROM participants WHERE leaderboard_id = ? ORDER BY normalized_name',
  ).bind(leaderboardId).all<ParticipantRow>()
  return rows.results.map((row) => ({ id: row.id, name: row.display_name }))
}

export async function getResults(
  env: Env,
  leaderboardId: string,
): Promise<ResultView[]> {
  const rows = await env.DB.prepare(
    `SELECT r.id, r.participant_id, p.display_name, r.result_year, r.result_month,
            r.result_day, r.is_calendar_date, r.round_1, r.round_2, r.round_3,
            r.round_4, r.round_5, r.final_score, r.created_at, r.updated_at
     FROM results r
     JOIN participants p ON p.id = r.participant_id
     WHERE r.leaderboard_id = ?`,
  ).bind(leaderboardId).all<ResultRow>()
  return rows.results.map(toResultView)
}

export async function buildSnapshot(
  env: Env,
  leaderboard: LeaderboardRow,
  historyDays: 7 | 30 = 7,
  leaderboardDate?: MapTapDate,
): Promise<LeaderboardSnapshot> {
  const [participants, results] = await Promise.all([
    getParticipants(env, leaderboard.id),
    getResults(env, leaderboard.id),
  ])
  const today = currentDate()
  const selectedDate = leaderboardDate ?? today
  const eligible = results.filter(
    (result) => result.date.isCalendarDate && compareDates(result.date, today) <= 0,
  )
  const historyKeys = new Set(dateRange(today, historyDays).map(dateKey))
  const historical = eligible
    .filter((result) => historyKeys.has(dateKey(result.date)))
    .sort((left, right) => compareDates(left.date, right.date))
  const earliest =
    eligible.length === 0
      ? null
      : eligible.reduce((earliestDate, result) =>
        compareDates(result.date, earliestDate) < 0 ? result.date : earliestDate,
        eligible[0].date)
  return {
    leaderboard: {
      id: leaderboard.id,
      name: leaderboard.name,
      currentDate: today,
    },
    participants,
    dailyLeaderboard: buildLeaderboard(
      participants,
      eligible.filter((result) => dateKey(result.date) === dateKey(selectedDate)),
    ),
    history: historical,
    personalBests: buildPersonalBests(participants, eligible),
    personalWorsts: buildPersonalWorsts(participants, eligible),
    earliestResultDate: earliest,
    historyDays,
  }
}

export function currentDate(now = new Date()): MapTapDate {
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
    isCalendarDate: true,
  }
}

export function toResultView(row: ResultRow): ResultView {
  return {
    id: row.id,
    participantId: row.participant_id,
    participantName: row.display_name,
    date: {
      year: row.result_year,
      month: row.result_month,
      day: row.result_day,
      isCalendarDate: row.is_calendar_date === 1,
    },
    roundScores: [row.round_1, row.round_2, row.round_3, row.round_4, row.round_5],
    finalScore: row.final_score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
