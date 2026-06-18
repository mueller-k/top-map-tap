import {
  compareDates,
  dateKey,
  dateRange,
  type DashboardSnapshot,
  type MapTapDate,
  type Participant,
  type ResultView,
} from '../shared/domain'
import { buildLeaderboard, buildPersonalBests } from '../shared/rankings'

export interface DashboardRow {
  id: string
  name: string
  time_zone: string
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

export async function getDashboard(
  env: Env,
  dashboardId: string,
): Promise<DashboardRow | null> {
  return env.DB.prepare(
    `SELECT id, name, time_zone, password_algorithm, password_iterations,
            password_salt, password_hash
     FROM dashboards WHERE id = ?`,
  ).bind(dashboardId).first<DashboardRow>()
}

export async function getParticipants(
  env: Env,
  dashboardId: string,
): Promise<Participant[]> {
  const rows = await env.DB.prepare(
    'SELECT id, display_name FROM participants WHERE dashboard_id = ? ORDER BY normalized_name',
  ).bind(dashboardId).all<ParticipantRow>()
  return rows.results.map((row) => ({ id: row.id, name: row.display_name }))
}

export async function getResults(
  env: Env,
  dashboardId: string,
): Promise<ResultView[]> {
  const rows = await env.DB.prepare(
    `SELECT r.id, r.participant_id, p.display_name, r.result_year, r.result_month,
            r.result_day, r.is_calendar_date, r.round_1, r.round_2, r.round_3,
            r.round_4, r.round_5, r.final_score, r.created_at, r.updated_at
     FROM results r
     JOIN participants p ON p.id = r.participant_id
     WHERE r.dashboard_id = ?`,
  ).bind(dashboardId).all<ResultRow>()
  return rows.results.map(toResultView)
}

export async function buildSnapshot(
  env: Env,
  dashboard: DashboardRow,
  historyDays: 7 | 30 = 7,
  leaderboardDate?: MapTapDate,
): Promise<DashboardSnapshot> {
  const [participants, results] = await Promise.all([
    getParticipants(env, dashboard.id),
    getResults(env, dashboard.id),
  ])
  const localDate = currentDateInTimeZone(dashboard.time_zone)
  const selectedDate = leaderboardDate ?? localDate
  const eligible = results.filter(
    (result) => result.date.isCalendarDate && compareDates(result.date, localDate) <= 0,
  )
  const historyKeys = new Set(dateRange(localDate, historyDays).map(dateKey))
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
    dashboard: {
      id: dashboard.id,
      name: dashboard.name,
      timeZone: dashboard.time_zone,
      localDate,
    },
    participants,
    leaderboard: buildLeaderboard(
      participants,
      eligible.filter((result) => dateKey(result.date) === dateKey(selectedDate)),
    ),
    history: historical,
    personalBests: buildPersonalBests(participants, eligible),
    earliestResultDate: earliest,
    historyDays,
  }
}

export function currentDateInTimeZone(timeZone: string): MapTapDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
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

