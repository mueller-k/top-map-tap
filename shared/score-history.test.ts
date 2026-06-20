import { describe, expect, it } from 'vitest'
import {
  scoreHistoryTooltipSortKey,
  scoreHistoryYAxisMinimum,
  scoreHistoryYAxisTicks,
} from './score-history'

describe('score history tooltip', () => {
  it('orders participants from highest score to lowest score', () => {
    const items = [
      { name: 'Alice', value: 720 },
      { name: 'Charlie', value: 910 },
      { name: 'Bob', value: 840 },
    ]

    expect(
      items
        .toSorted(
          (left, right) =>
            scoreHistoryTooltipSortKey(left) -
            scoreHistoryTooltipSortKey(right),
        )
        .map((item) => item.name),
    ).toEqual(['Charlie', 'Bob', 'Alice'])
  })
})

describe('score history Y axis', () => {
  it('starts at 500 when every visible score is at least 500', () => {
    expect(scoreHistoryYAxisMinimum([500, 742, 1000])).toBe(500)
    expect(scoreHistoryYAxisMinimum([])).toBe(500)
  })

  it('rounds a lower visible score down to the nearest hundred', () => {
    expect(scoreHistoryYAxisMinimum([437, 820])).toBe(400)
  })

  it('keeps an exact hundred-point boundary', () => {
    expect(scoreHistoryYAxisMinimum([400, 820])).toBe(400)
  })

  it('supports a score of zero', () => {
    expect(scoreHistoryYAxisMinimum([0, 820])).toBe(0)
  })

  it('creates ticks every hundred points through 1000', () => {
    expect(scoreHistoryYAxisTicks(500)).toEqual([
      500, 600, 700, 800, 900, 1000,
    ])
    expect(scoreHistoryYAxisTicks(0)).toHaveLength(11)
  })
})
