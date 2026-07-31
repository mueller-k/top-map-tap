import { describe, expect, it } from 'vitest'
import type { Participant, ResultView } from './domain'
import {
  buildAllTimeAverages,
  buildAllTimeWins,
  buildHundoHunter,
  buildLeaderboard,
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
      row.lastWinDate?.day ?? null,
      row.rank,
    ])).toEqual([
      ['Alice', 2, 17, 1],
      ['Bob', 1, 16, 2],
      ['Charlie', 1, 16, 2],
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
      row.lastWinDate?.day ?? null,
      row.rank,
    ])).toEqual([
      ['Bob', 1, 16, 1],
      ['Alice', 1, 15, 2],
      ['Charlie', 0, null, 3],
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
      row.lastWinDate?.day ?? null,
      row.rank,
    ])).toEqual([
      ['Alice', 1, 15, 1],
      ['Bob', 0, null, 2],
      ['Charlie', 0, null, 2],
    ])
  })

  it('gives every participant Rank 1 when every win count is zero', () => {
    const rows = buildAllTimeWins(participants, [], currentDate)

    expect(rows.map((row) => [
      row.participant.name,
      row.winCount,
      row.lastWinDate?.day ?? null,
      row.rank,
    ])).toEqual([
      ['Alice', 0, null, 1],
      ['Bob', 0, null, 1],
      ['Charlie', 0, null, 1],
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
      row.lastWinDate?.day ?? null,
      row.rank,
    ])).toEqual([
      ['Alice', 1, 17, 1],
      ['Bob', 0, null, 2],
      ['Charlie', 0, null, 2],
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

  it('competition-ranks every participant by all 100-point rounds', () => {
    const aliceFirst = result('1', 'a', 900, 15)
    aliceFirst.roundScores = [100, 100, 80, 70, 60]
    const aliceSecond = result('2', 'a', 850, 16)
    aliceSecond.roundScores = [90, 80, 100, 70, 60]
    const bob = result('3', 'b', 800, 15)
    bob.roundScores = [100, 90, 100, 80, 100]
    const charlie = result('4', 'c', 100, 15)

    const rows = buildHundoHunter(participants, [
      aliceFirst,
      aliceSecond,
      bob,
      charlie,
    ])

    expect(rows.map((row) => [
      row.participant.name,
      row.hundoCount,
      row.rank,
    ])).toEqual([
      ['Alice', 3, 1],
      ['Bob', 3, 1],
      ['Charlie', 0, 3],
    ])
  })
})
