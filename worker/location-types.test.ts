import { describe, expect, it } from 'vitest'
import {
  formatArchiveDate,
  latestEligibleArchiveDate,
  nextArchiveDate,
  parseArchiveDate,
} from './location-types'

describe('location archive dates', () => {
  it('uses the date that ended everywhere after the 12:00 UTC boundary', () => {
    expect(formatArchiveDate(latestEligibleArchiveDate(
      new Date('2026-08-07T12:15:00Z'),
    ))).toBe('2026-08-06')
    expect(formatArchiveDate(latestEligibleArchiveDate(
      new Date('2026-08-07T11:59:59Z'),
    ))).toBe('2026-08-05')
  })

  it('advances through real calendar dates including leap days', () => {
    expect(nextArchiveDate({ year: 2028, month: 2, day: 28 })).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    })
    expect(parseArchiveDate('2026-02-29')).toBeNull()
    expect(parseArchiveDate('2026-12-31')).toEqual({ year: 2026, month: 12, day: 31 })
  })
})
