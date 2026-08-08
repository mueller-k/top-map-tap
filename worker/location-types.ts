export interface ArchiveDate {
  year: number
  month: number
  day: number
}

export interface MapTapLocation {
  sourceLabel: string
  latitude: number
  longitude: number
}

export interface CollectedMapTapDay {
  date: ArchiveDate
  sourceUrl: string
  locations: [
    MapTapLocation,
    MapTapLocation,
    MapTapLocation,
    MapTapLocation,
    MapTapLocation,
  ]
}

export interface GeographicEnrichment {
  geocodedLatitude: number | null
  geocodedLongitude: number | null
  continent: Continent | null
  countryName: string | null
  countryCode: string | null
  subdivisionName: string | null
  localityName: string | null
  featureTypes: string[]
}

export type Continent =
  | 'Africa'
  | 'Antarctica'
  | 'Asia'
  | 'Europe'
  | 'North America'
  | 'Oceania'
  | 'South America'

export function formatArchiveDate(date: ArchiveDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

export function parseArchiveDate(value: string): ArchiveDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
  return isCalendarDate(date) ? date : null
}

export function isCalendarDate(date: ArchiveDate): boolean {
  const timestamp = Date.UTC(date.year, date.month - 1, date.day)
  const parsed = new Date(timestamp)
  return parsed.getUTCFullYear() === date.year
    && parsed.getUTCMonth() + 1 === date.month
    && parsed.getUTCDate() === date.day
}

export function compareArchiveDates(left: ArchiveDate, right: ArchiveDate): number {
  return archiveDateTimestamp(left) - archiveDateTimestamp(right)
}

export function nextArchiveDate(date: ArchiveDate): ArchiveDate {
  return archiveDateFromTimestamp(archiveDateTimestamp(date) + 86_400_000)
}

export function previousArchiveDate(date: ArchiveDate): ArchiveDate {
  return archiveDateFromTimestamp(archiveDateTimestamp(date) - 86_400_000)
}

export function latestEligibleArchiveDate(now: Date): ArchiveDate {
  const publicationBoundary = new Date(now.getTime() - 12 * 60 * 60 * 1000)
  return previousArchiveDate({
    year: publicationBoundary.getUTCFullYear(),
    month: publicationBoundary.getUTCMonth() + 1,
    day: publicationBoundary.getUTCDate(),
  })
}

function archiveDateTimestamp(date: ArchiveDate): number {
  return Date.UTC(date.year, date.month - 1, date.day)
}

function archiveDateFromTimestamp(timestamp: number): ArchiveDate {
  const parsed = new Date(timestamp)
  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
  }
}
