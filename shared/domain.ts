export const LEADERBOARD_ID_LENGTH = 12
export const MAX_PARTICIPANTS = 25
export const MAX_SOURCE_TEXT_LENGTH = 2_000

export interface MapTapDate {
  year: number
  month: number
  day: number
  isCalendarDate: boolean
}

export interface ParsedResult {
  date: MapTapDate
  roundScores: [number, number, number, number, number]
  finalScore: number
  sourceText: string
}

export interface Participant {
  id: string
  name: string
}

export interface ResultView {
  id: string
  participantId: string
  participantName: string
  date: MapTapDate
  roundScores: [number, number, number, number, number]
  finalScore: number
  createdAt: string
  updatedAt: string
}

export interface LeaderboardRow {
  participant: Participant
  rank: number | null
  result: ResultView | null
}

export interface PersonalBestRow {
  participant: Participant
  rank: number | null
  result: ResultView | null
}

export interface PersonalWorstRow {
  participant: Participant
  rank: number | null
  result: ResultView | null
}

export interface LeaderboardSnapshot {
  leaderboard: {
    id: string
    name: string
    currentDate: MapTapDate
  }
  participants: Participant[]
  dailyLeaderboard: LeaderboardRow[]
  history: ResultView[]
  personalBests: PersonalBestRow[]
  personalWorsts: PersonalWorstRow[]
  earliestResultDate: MapTapDate | null
  historyDays: 7 | 30
}

export interface RecentLeaderboard {
  id: string
  name: string
  lastAccessedAt: string
}

export interface ApiError {
  error: {
    code: string
    message: string
  }
}

export function normalizeName(value: string): {
  display: string
  normalized: string
} {
  const display = value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
  return { display, normalized: display.toLocaleLowerCase('und') }
}

export function isValidName(value: string, maximum: number): boolean {
  const { display } = normalizeName(value)
  const length = Array.from(display).length
  return (
    length >= 1 &&
    length <= maximum &&
    !Array.from(display).some((character) => {
      const code = character.codePointAt(0) ?? 0
      return code <= 31 || (code >= 127 && code <= 159)
    })
  )
}

export function dateKey(date: Pick<MapTapDate, 'year' | 'month' | 'day'>): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

export function parseDateKey(value: string): MapTapDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) {
    return null
  }
  return { ...date, isCalendarDate: isCalendarDate(date) }
}

export function isCalendarDate(
  date: Pick<MapTapDate, 'year' | 'month' | 'day'>,
): boolean {
  if (date.month < 1 || date.month > 12) return false
  const daysInMonth = new Date(Date.UTC(date.year, date.month, 0)).getUTCDate()
  return date.day >= 1 && date.day <= daysInMonth
}

export function compareDates(
  left: Pick<MapTapDate, 'year' | 'month' | 'day'>,
  right: Pick<MapTapDate, 'year' | 'month' | 'day'>,
): number {
  return dateKey(left).localeCompare(dateKey(right))
}

export function shiftCalendarDate(date: MapTapDate, days: number): MapTapDate {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    isCalendarDate: true,
  }
}

export function dateRange(end: MapTapDate, days: number): MapTapDate[] {
  return Array.from({ length: days }, (_, index) =>
    shiftCalendarDate(end, index - days + 1),
  )
}
