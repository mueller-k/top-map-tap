import {
  type AllTimeAverageRow,
  type AllTimeWinRow,
  compareDates,
  dateKey,
  type HundoHunterRow,
  type LeaderboardRow,
  type MapTapDate,
  type Participant,
  type PersonalBestRow,
  type PersonalWorstRow,
  type ResultView,
} from './domain'

export function buildLeaderboard(
  participants: Participant[],
  results: ResultView[],
): LeaderboardRow[] {
  return buildRankedRows(participants, results, 'descending')
}

export function buildPersonalBests(
  participants: Participant[],
  results: ResultView[],
): PersonalBestRow[] {
  const bestByParticipant = new Map<string, ResultView>()
  for (const result of results) {
    const current = bestByParticipant.get(result.participantId)
    if (
      !current ||
      result.finalScore > current.finalScore ||
      (result.finalScore === current.finalScore &&
        compareDates(result.date, current.date) < 0)
    ) {
      bestByParticipant.set(result.participantId, result)
    }
  }
  return buildLeaderboard(participants, [...bestByParticipant.values()])
}

export function buildPersonalWorsts(
  participants: Participant[],
  results: ResultView[],
): PersonalWorstRow[] {
  const worstByParticipant = new Map<string, ResultView>()
  for (const result of results) {
    const current = worstByParticipant.get(result.participantId)
    if (
      !current ||
      result.finalScore < current.finalScore ||
      (result.finalScore === current.finalScore &&
        compareDates(result.date, current.date) < 0)
    ) {
      worstByParticipant.set(result.participantId, result)
    }
  }
  return buildRankedRows(
    participants,
    [...worstByParticipant.values()],
    'ascending',
  )
}

export function buildAllTimeAverages(
  participants: Participant[],
  results: ResultView[],
): AllTimeAverageRow[] {
  const totals = new Map<string, { sum: number; count: number }>()
  for (const result of results) {
    const current = totals.get(result.participantId) ?? { sum: 0, count: 0 }
    current.sum += result.finalScore
    current.count += 1
    totals.set(result.participantId, current)
  }

  const scored = participants
    .filter((participant) => totals.has(participant.id))
    .map((participant) => {
      const total = totals.get(participant.id)!
      return {
        participant,
        average: Math.round((total.sum / total.count) * 10) / 10,
        resultCount: total.count,
      }
    })
    .sort((left, right) =>
      right.average - left.average ||
      right.resultCount - left.resultCount ||
      compareNames(left.participant.name, right.participant.name))

  let previousAverage: number | null = null
  let previousCount: number | null = null
  let previousRank = 0
  const ranked = scored.map((row, index): AllTimeAverageRow => {
    const rank =
      previousAverage === row.average && previousCount === row.resultCount
        ? previousRank
        : index + 1
    previousAverage = row.average
    previousCount = row.resultCount
    previousRank = rank
    return { ...row, rank }
  })

  const empty = participants
    .filter((participant) => !totals.has(participant.id))
    .sort((left, right) => compareNames(left.name, right.name))
    .map((participant): AllTimeAverageRow => ({
      participant,
      rank: null,
      average: null,
      resultCount: 0,
    }))

  return [...ranked, ...empty]
}

export function buildAllTimeWins(
  participants: Participant[],
  results: ResultView[],
  currentDate: MapTapDate,
): AllTimeWinRow[] {
  const winnersByDate = new Map<
    string,
    { date: ResultView['date']; score: number; participantIds: Set<string> }
  >()

  for (const result of results) {
    if (
      !result.date.isCalendarDate ||
      compareDates(result.date, currentDate) >= 0
    ) {
      continue
    }
    const key = dateKey(result.date)
    const current = winnersByDate.get(key)
    if (!current || result.finalScore > current.score) {
      winnersByDate.set(key, {
        date: result.date,
        score: result.finalScore,
        participantIds: new Set([result.participantId]),
      })
    } else if (result.finalScore === current.score) {
      current.participantIds.add(result.participantId)
    }
  }

  const winsByParticipant = new Map(
    participants.map((participant) => [
      participant.id,
      { winCount: 0, lastWinDate: null as ResultView['date'] | null },
    ]),
  )
  for (const { date, participantIds } of winnersByDate.values()) {
    for (const participantId of participantIds) {
      const wins = winsByParticipant.get(participantId) ?? {
        winCount: 0,
        lastWinDate: null,
      }
      wins.winCount += 1
      if (!wins.lastWinDate || compareDates(date, wins.lastWinDate) > 0) {
        wins.lastWinDate = date
      }
      winsByParticipant.set(participantId, wins)
    }
  }

  const rows = participants
    .map((participant) => {
      const wins = winsByParticipant.get(participant.id)
      return {
        participant,
        winCount: wins?.winCount ?? 0,
        lastWinDate: wins?.lastWinDate ?? null,
      }
    })
    .sort((left, right) =>
      right.winCount - left.winCount ||
      compareOptionalDatesDescending(left.lastWinDate, right.lastWinDate) ||
      compareNames(left.participant.name, right.participant.name))

  let previousWinCount: number | null = null
  let previousLastWinDate: ResultView['date'] | null = null
  let previousRank = 0
  return rows.map((row, index): AllTimeWinRow => {
    const rank =
      index > 0 &&
      previousWinCount === row.winCount &&
      compareOptionalDatesDescending(previousLastWinDate, row.lastWinDate) === 0
        ? previousRank
        : index + 1
    previousWinCount = row.winCount
    previousLastWinDate = row.lastWinDate
    previousRank = rank
    return { ...row, rank }
  })
}

export function buildHundoHunter(
  participants: Participant[],
  results: ResultView[],
): HundoHunterRow[] {
  const counts = new Map<string, number>()
  for (const result of results) {
    const hundos = result.roundScores.filter((score) => score === 100).length
    counts.set(
      result.participantId,
      (counts.get(result.participantId) ?? 0) + hundos,
    )
  }

  const rows = participants
    .map((participant) => ({
      participant,
      hundoCount: counts.get(participant.id) ?? 0,
    }))
    .sort((left, right) =>
      right.hundoCount - left.hundoCount ||
      compareNames(left.participant.name, right.participant.name))

  let previousCount: number | null = null
  let previousRank = 0
  return rows.map((row, index): HundoHunterRow => {
    const rank = previousCount === row.hundoCount ? previousRank : index + 1
    previousCount = row.hundoCount
    previousRank = rank
    return { ...row, rank }
  })
}

function compareOptionalDatesDescending(
  left: ResultView['date'] | null,
  right: ResultView['date'] | null,
): number {
  if (left && right) return compareDates(right, left)
  if (left) return -1
  if (right) return 1
  return 0
}

function buildRankedRows(
  participants: Participant[],
  results: ResultView[],
  direction: 'ascending' | 'descending',
): LeaderboardRow[] {
  const resultByParticipant = new Map(results.map((result) => [result.participantId, result]))
  const scored = participants
    .filter((participant) => resultByParticipant.has(participant.id))
    .sort((left, right) => {
      const leftScore = resultByParticipant.get(left.id)!.finalScore
      const rightScore = resultByParticipant.get(right.id)!.finalScore
      const difference =
        direction === 'ascending'
          ? leftScore - rightScore
          : rightScore - leftScore
      return difference || compareNames(left.name, right.name)
    })
  let previousScore: number | null = null
  let previousRank = 0
  const ranked = scored.map((participant, index): LeaderboardRow => {
    const result = resultByParticipant.get(participant.id)!
    const rank = previousScore === result.finalScore ? previousRank : index + 1
    previousScore = result.finalScore
    previousRank = rank
    return { participant, result, rank }
  })
  const empty = participants
    .filter((participant) => !resultByParticipant.has(participant.id))
    .sort((left, right) => compareNames(left.name, right.name))
    .map((participant): LeaderboardRow => ({ participant, result: null, rank: null }))
  return [...ranked, ...empty]
}

function compareNames(left: string, right: string): number {
  return left.localeCompare(right, 'en', { sensitivity: 'base' })
}
