import {
  type AllTimeAverageRow,
  compareDates,
  type LeaderboardRow,
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
