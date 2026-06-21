import { describe, expect, it } from 'vitest'
import type { Participant, ResultView } from './domain'
import {
  buildLeaderboard,
  buildPersonalBests,
  buildPersonalWorsts,
} from './rankings'

const participants: Participant[] = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Charlie' },
]

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
})
