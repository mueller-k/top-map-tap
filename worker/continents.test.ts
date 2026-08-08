import { describe, expect, it } from 'vitest'
import { continentForCountryCode } from './continents'

describe('country and territory continents', () => {
  it('uses the agreed deterministic seven-continent assignments', () => {
    expect(continentForCountryCode('US')).toBe('North America')
    expect(continentForCountryCode('PA')).toBe('North America')
    expect(continentForCountryCode('AU')).toBe('Oceania')
    expect(continentForCountryCode('UM')).toBe('Oceania')
    expect(continentForCountryCode('RU')).toBe('Europe')
    expect(continentForCountryCode('TR')).toBe('Asia')
    expect(continentForCountryCode('AQ')).toBe('Antarctica')
    expect(continentForCountryCode('BR')).toBe('South America')
    expect(continentForCountryCode('XX')).toBeNull()
    expect(continentForCountryCode(null)).toBeNull()
  })
})
