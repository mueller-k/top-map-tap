import { describe, expect, it } from 'vitest'
import { parseMapTapResult } from './parser'

describe('parseMapTapResult', () => {
  it('parses copied MapTap text while ignoring emoji semantics', () => {
    const source =
      'www.maptap.gg June 18\n100🎯 95🏅 96🔥 97🔥 65🤨\nFinal score: 873'
    expect(parseMapTapResult(source, 2026)).toEqual({
      ok: true,
      value: {
        date: { year: 2026, month: 6, day: 18, isCalendarDate: true },
        roundScores: [100, 95, 96, 97, 65],
        finalScore: 873,
        sourceText: source,
      },
    })
  })

  it('accepts an impossible date but marks it as non-calendar', () => {
    const parsed = parseMapTapResult(
      'maptap.gg February 31\n1 2 3 4 5\nFinal score: 10',
      2026,
    )
    expect(parsed.ok && parsed.value.date.isCalendarDate).toBe(false)
  })

  it('rejects extra middle numbers', () => {
    const parsed = parseMapTapResult(
      'https://maptap.gg June 18, 2025\n1 2 3 4 5 6\nFinal score: 20',
      2026,
    )
    expect(parsed).toMatchObject({ ok: false, code: 'EXPECTED_FIVE_ROUNDS' })
  })

  it('checks ranges but not score relationships', () => {
    expect(
      parseMapTapResult(
        'maptap.gg Jun 18\n100 100 100 100 100\nFinal score: 0',
        2026,
      ).ok,
    ).toBe(true)
    expect(
      parseMapTapResult(
        'maptap.gg Jun 18\n101 1 2 3 4\nFinal score: 10',
        2026,
      ),
    ).toMatchObject({ ok: false, code: 'ROUND_OUT_OF_RANGE' })
  })
})
