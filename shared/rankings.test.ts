import { describe, expect, it } from 'vitest'
import type { ContinentScoreTotal, Participant, ResultView } from './domain'
import {
  buildAllTimeAverages,
  buildAllTimeWins,
  buildContinentalPlacements,
  buildHundoHunter,
  buildLeaderboard,
  buildPerfectResults,
  buildPersonalBests,
  buildPersonalWorsts,
} from './rankings'

const participants: Participant[] = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Charlie' },
]
const currentDate = { year: 2026, month: 6, day: 18, isCalendarDate: true }

function result(id: string, participantId: string, finalScore: number, day: number): ResultView {
  return {
    id,
    participantId,
    participantName:
      participants.find((participant) => participant.id === participantId)?.name ?? '',
    date: { year: 2026, month: 6, day, isCalendarDate: true },
    roundScores: [1, 2, 3, 4, 5],
    finalScore,
    createdAt: '',
    updatedAt: '',
  }
}

describe('rankings', () => {
  it('uses competition ranking and puts empty participants last', () => {
    const rows = buildLeaderboard(participants, [
      result('1', 'b', 900, 18),
      result('2', 'a', 900, 18),
    ])
    expect(rows.map((row) => [row.participant.name, row.rank])).toEqual([
      ['Alice', 1],
      ['Bob', 1],
      ['Charlie', null],
    ])
  })

  it('uses the earliest tied personal best date', () => {
    const rows = buildPersonalBests(participants, [
      result('1', 'a', 900, 18),
      result('2', 'a', 900, 17),
      result('3', 'b', 800, 18),
    ])
    expect(rows[0].result?.date.day).toBe(17)
  })

  it('uses each participant’s lowest score for personal worsts', () => {
    const rows = buildPersonalWorsts(participants, [
      result('1', 'a', 900, 16),
      result('2', 'a', 700, 17),
      result('3', 'b', 800, 18),
    ])
    expect(
      rows.map((row) => [
        row.participant.name,
        row.result?.finalScore ?? null,
        row.rank,
      ]),
    ).toEqual([
      ['Alice', 700, 1],
      ['Bob', 800, 2],
      ['Charlie', null, null],
    ])
  })

  it('uses the earliest tied personal worst date', () => {
    const rows = buildPersonalWorsts(participants, [
      result('1', 'a', 700, 18),
      result('2', 'a', 700, 17),
    ])
    expect(rows[0].result?.date.day).toBe(17)
  })

  it('ranks rounded all-time averages, breaking ties by result count', () => {
    const rows = buildAllTimeAverages(participants, [
      result('1', 'a', 812, 15),
      result('2', 'a', 813, 16),
      result('3', 'b', 812, 15),
      result('4', 'b', 812, 16),
      result('5', 'b', 813, 17),
      result('6', 'b', 813, 18),
    ])

    expect(rows.map((row) => [
      row.participant.name,
      row.average,
      row.resultCount,
      row.rank,
    ])).toEqual([
      ['Bob', 812.5, 4, 1],
      ['Alice', 812.5, 2, 2],
      ['Charlie', null, 0, null],
    ])
  })

  it('shares an average rank only when average and result count match', () => {
    const rows = buildAllTimeAverages(participants, [
      result('1', 'a', 812, 15),
      result('2', 'a', 813, 16),
      result('3', 'b', 812, 15),
      result('4', 'b', 813, 16),
      result('5', 'c', 812, 15),
    ])

    expect(rows.map((row) => [row.participant.name, row.rank])).toEqual([
      ['Alice', 1],
      ['Bob', 1],
      ['Charlie', 3],
    ])
  })

  it('builds the top two dense Continental Placements in display order', () => {
    const totals: ContinentScoreTotal[] = [
      { participantId: 'a', continent: 'North America', scoreTotal: 190, roundScoreCount: 2 },
      { participantId: 'b', continent: 'North America', scoreTotal: 95, roundScoreCount: 1 },
      { participantId: 'c', continent: 'North America', scoreTotal: 94, roundScoreCount: 1 },
      { participantId: 'a', continent: 'Europe', scoreTotal: 190, roundScoreCount: 2 },
      { participantId: 'b', continent: 'Europe', scoreTotal: 190, roundScoreCount: 2 },
      { participantId: 'c', continent: 'Europe', scoreTotal: 94, roundScoreCount: 1 },
    ]

    const groups = buildContinentalPlacements(participants, totals)

    expect(groups.map(({ continent }) => continent)).toEqual([
      'North America',
      'Europe',
      'Asia',
      'South America',
      'Africa',
      'Oceania',
      'Antarctica',
    ])
    expect(groups[0].placements).toEqual([
      {
        placement: 1,
        participants: [{ id: 'a', name: 'Alice' }],
        accuracy: 95,
        roundScoreCount: 2,
      },
      {
        placement: 2,
        participants: [{ id: 'b', name: 'Bob' }],
        accuracy: 95,
        roundScoreCount: 1,
      },
    ])
    expect(groups[1].placements).toEqual([
      {
        placement: 1,
        participants: [
          { id: 'a', name: 'Alice' },
          { id: 'b', name: 'Bob' },
        ],
        accuracy: 95,
        roundScoreCount: 2,
      },
      {
        placement: 2,
        participants: [{ id: 'c', name: 'Charlie' }],
        accuracy: 94,
        roundScoreCount: 1,
      },
    ])
    expect(groups.slice(2).every(({ placements }) => placements.length === 0)).toBe(true)
  })

  it('ranks by the displayed hundredth and combines duplicate score totals', () => {
    const groups = buildContinentalPlacements(participants, [
      { participantId: 'a', continent: 'Asia', scoreTotal: 9_495, roundScoreCount: 100 },
      { participantId: 'b', continent: 'Asia', scoreTotal: 9_495, roundScoreCount: 100 },
      { participantId: 'b', continent: 'Asia', scoreTotal: 9_496, roundScoreCount: 100 },
      { participantId: 'c', continent: 'Asia', scoreTotal: 9_494, roundScoreCount: 100 },
    ])

    expect(groups.find(({ continent }) => continent === 'Asia')?.placements).toEqual([
      {
        placement: 1,
        participants: [{ id: 'b', name: 'Bob' }],
        accuracy: 94.96,
        roundScoreCount: 200,
      },
      {
        placement: 2,
        participants: [{ id: 'a', name: 'Alice' }],
        accuracy: 94.95,
        roundScoreCount: 100,
      },
    ])
  })

  it('counts shared and sole daily wins', () => {
    const rows = buildAllTimeWins(participants, [
      result('1', 'a', 900, 15),
      result('2', 'b', 800, 15),
      result('3', 'a', 700, 16),
      result('4', 'b', 900, 16),
      result('5', 'c', 900, 16),
      result('6', 'a', 850, 17),
    ], currentDate)

    expect(rows.map((row) => [
      row.participant.name,
      row.winCount,
      row.winPercentage,
      row.lastWinDate?.day ?? null,
      row.rank,
    ])).toEqual([
      ['Alice', 2, 66.7, 17, 1],
      ['Bob', 1, 50, 16, 2],
      ['Charlie', 1, 100, 16, 2],
    ])
  })

  it('breaks equal win counts by the latest Last Win Date', () => {
    const rows = buildAllTimeWins(participants, [
      result('1', 'a', 900, 15),
      result('2', 'b', 800, 15),
      result('3', 'a', 800, 16),
      result('4', 'b', 900, 16),
    ], currentDate)

    expect(rows.map((row) => [
      row.participant.name,
      row.winCount,
      row.winPercentage,
      row.lastWinDate?.day ?? null,
      row.rank,
    ])).toEqual([
      ['Bob', 1, 50, 16, 1],
      ['Alice', 1, 50, 15, 2],
      ['Charlie', 0, null, null, 3],
    ])
  })

  it('competition-ranks zero-win participants alphabetically', () => {
    const rows = buildAllTimeWins(participants, [
      result('1', 'a', 900, 15),
      result('2', 'b', 800, 15),
    ], currentDate)

    expect(rows.map((row) => [
      row.participant.name,
      row.winCount,
      row.winPercentage,
      row.lastWinDate?.day ?? null,
      row.rank,
    ])).toEqual([
      ['Alice', 1, 100, 15, 1],
      ['Bob', 0, 0, null, 2],
      ['Charlie', 0, null, null, 2],
    ])
  })

  it('gives every participant Rank 1 when every win count is zero', () => {
    const rows = buildAllTimeWins(participants, [], currentDate)

    expect(rows.map((row) => [
      row.participant.name,
      row.winCount,
      row.winPercentage,
      row.lastWinDate?.day ?? null,
      row.rank,
    ])).toEqual([
      ['Alice', 0, null, null, 1],
      ['Bob', 0, null, null, 1],
      ['Charlie', 0, null, null, 1],
    ])
  })

  it('excludes current-day and future results from daily wins', () => {
    const impossiblePastResult = result('6', 'c', 1000, 16)
    impossiblePastResult.date.isCalendarDate = false
    const rows = buildAllTimeWins(participants, [
      result('1', 'a', 900, 17),
      result('2', 'b', 800, 17),
      result('3', 'a', 700, 18),
      result('4', 'b', 950, 18),
      result('5', 'c', 1000, 19),
      impossiblePastResult,
    ], currentDate)

    expect(rows.map((row) => [
      row.participant.name,
      row.winCount,
      row.winPercentage,
      row.lastWinDate?.day ?? null,
      row.rank,
    ])).toEqual([
      ['Alice', 1, 100, 17, 1],
      ['Bob', 0, 0, null, 2],
      ['Charlie', 0, null, null, 2],
    ])
  })

  it('counts a current-day leader after the Current Date advances', () => {
    const results = [
      result('1', 'a', 700, 18),
      result('2', 'b', 950, 18),
    ]

    const today = buildAllTimeWins(participants, results, currentDate)
    const tomorrow = buildAllTimeWins(participants, results, {
      ...currentDate,
      day: 19,
    })

    expect(today.map((row) => [row.participant.name, row.winCount])).toEqual([
      ['Alice', 0],
      ['Bob', 0],
      ['Charlie', 0],
    ])
    expect(tomorrow.map((row) => [
      row.participant.name,
      row.winCount,
      row.lastWinDate?.day ?? null,
    ])).toEqual([
      ['Bob', 1, 18],
      ['Alice', 0, null],
      ['Charlie', 0, null],
    ])
  })

  it('breaks equal Hundo counts by fewer Zeros', () => {
    const aliceFirst = result('1', 'a', 900, 15)
    aliceFirst.roundScores = [100, 100, 0, 0, 0]
    const aliceSecond = result('2', 'a', 850, 16)
    aliceSecond.roundScores = [0, 0, 100, 0, 0]
    const bob = result('3', 'b', 800, 15)
    bob.roundScores = [100, 90, 100, 80, 100]
    const charlie = result('4', 'c', 100, 15)
    charlie.roundScores = [0, 1, 2, 3, 4]

    const rows = buildHundoHunter(participants, [
      aliceFirst,
      aliceSecond,
      bob,
      charlie,
    ])

    expect(rows.map((row) => [
      row.participant.name,
      row.hundoCount,
      row.zeroCount,
      row.rank,
    ])).toEqual([
      ['Bob', 3, 0, 1],
      ['Alice', 3, 7, 2],
      ['Charlie', 0, 1, 3],
    ])
  })

  it('shares a Hundo Hunter rank only when Hundo and Zero counts match', () => {
    const alice = result('1', 'a', 900, 15)
    alice.roundScores = [100, 0, 80, 70, 60]
    const bob = result('2', 'b', 800, 15)
    bob.roundScores = [100, 0, 90, 80, 70]

    const rows = buildHundoHunter(participants, [alice, bob])

    expect(rows.map((row) => [row.participant.name, row.rank])).toEqual([
      ['Alice', 1],
      ['Bob', 1],
      ['Charlie', 3],
    ])
  })

  it('ranks exact 1000-point results by count and Last Perfection Date', () => {
    const charlie = result('5', 'c', 999, 18)
    charlie.roundScores = [100, 100, 100, 100, 100]

    const rows = buildPerfectResults(participants, [
      result('1', 'a', 1000, 15),
      result('2', 'a', 1000, 17),
      result('3', 'b', 1000, 16),
      result('4', 'b', 1000, 18),
      charlie,
    ])

    expect(rows.map((row) => [
      row.participant.name,
      row.perfectResultCount,
      row.lastPerfectionDate?.day ?? null,
      row.rank,
    ])).toEqual([
      ['Bob', 2, 18, 1],
      ['Alice', 2, 17, 2],
      ['Charlie', 0, null, 3],
    ])
  })

  it('shares a Perfect Results rank only when count and date match', () => {
    const rows = buildPerfectResults(participants, [
      result('1', 'a', 1000, 18),
      result('2', 'b', 1000, 18),
    ])

    expect(rows.map((row) => [row.participant.name, row.rank])).toEqual([
      ['Alice', 1],
      ['Bob', 1],
      ['Charlie', 3],
    ])
  })
})
