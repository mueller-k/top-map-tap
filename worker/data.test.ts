import { describe, expect, it } from 'vitest'
import { currentDate } from './data'

describe('currentDate', () => {
  it('uses one shared UTC calendar date for every leaderboard', () => {
    expect(currentDate(new Date('2026-01-01T00:30:00+14:00'))).toEqual({
      year: 2025,
      month: 12,
      day: 31,
      isCalendarDate: true,
    })
  })
})
