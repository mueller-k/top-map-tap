import { reverseGeocode, type GeocodingResult } from './geocoding'
import {
  collectMapTapDay,
  mapTapDayUrl,
  type MapTapCollectionResult,
} from './maptap-locations'
import {
  compareArchiveDates,
  formatArchiveDate,
  latestEligibleArchiveDate,
  nextArchiveDate,
  type ArchiveDate,
  type CollectedMapTapDay,
  type MapTapLocation,
} from './location-types'

export const LOCATION_ARCHIVE_START: ArchiveDate = { year: 2026, month: 1, day: 1 }

interface CoveredDateRow {
  result_year: number
  result_month: number
  result_day: number
  location_count: number
}

interface PendingLocationRow {
  result_year: number
  result_month: number
  result_day: number
  round_number: number
  source_label: string
  maptap_latitude: number
  maptap_longitude: number
}

export interface LocationArchiveHealth {
  status: 'ok' | 'degraded'
  locationArchive: {
    eligibleThrough: string
    uncoveredDateCount: number
    oldestUncoveredDate: string | null
    pendingEnrichmentCount: number
  }
}

export interface DailyArchiveSummary {
  eligibleThrough: string
  capturedDateCount: number
  alreadyCoveredDateCount: number
  unavailableDates: string[]
  inconsistentDates: string[]
  completedEnrichmentCount: number
  pendingEnrichmentCount: number
}

export type CaptureDateResult =
  | { status: 'captured'; date: string }
  | { status: 'covered'; date: string }
  | { status: 'unavailable'; date: string; reason: string }
  | { status: 'inconsistent'; date: string; reason: string }

interface ArchiveDependencies {
  collectDay: (date: ArchiveDate) => Promise<MapTapCollectionResult>
  geocode: (location: MapTapLocation, apiKey: string) => Promise<GeocodingResult>
  now: () => Date
}

const defaultDependencies: ArchiveDependencies = {
  collectDay: (date) => collectMapTapDay(date),
  geocode: (location, apiKey) => reverseGeocode(location, apiKey),
  now: () => new Date(),
}

export async function runDailyLocationArchive(
  env: Env,
  now = new Date(),
  dependencies: Partial<ArchiveDependencies> = {},
): Promise<DailyArchiveSummary> {
  const resolved = { ...defaultDependencies, ...dependencies }
  const eligibleThrough = latestEligibleArchiveDate(now)
  const firstResult = await captureArchiveDate(env.DB, eligibleThrough, resolved)
  const remaining = (await findUncoveredArchiveDates(env.DB, eligibleThrough))
    .filter((date) => compareArchiveDates(date, eligibleThrough) !== 0)
  const captureResults = [firstResult]
  for (const date of remaining) {
    captureResults.push(await captureArchiveDate(env.DB, date, resolved))
  }

  const enrichment = await enrichPendingLocations(env, undefined, resolved)
  const summary: DailyArchiveSummary = {
    eligibleThrough: formatArchiveDate(eligibleThrough),
    capturedDateCount: captureResults.filter(({ status }) => status === 'captured').length,
    alreadyCoveredDateCount: captureResults.filter(({ status }) => status === 'covered').length,
    unavailableDates: captureResults
      .filter((result): result is Extract<CaptureDateResult, { status: 'unavailable' }> =>
        result.status === 'unavailable')
      .map(({ date }) => date),
    inconsistentDates: captureResults
      .filter((result): result is Extract<CaptureDateResult, { status: 'inconsistent' }> =>
        result.status === 'inconsistent')
      .map(({ date }) => date),
    completedEnrichmentCount: enrichment.completedCount,
    pendingEnrichmentCount: enrichment.pendingCount,
  }
  console.log(JSON.stringify({ event: 'location_archive_daily_complete', ...summary }))
  return summary
}

export async function captureArchiveDate(
  database: D1Database,
  date: ArchiveDate,
  dependencies: Partial<ArchiveDependencies> = {},
): Promise<CaptureDateResult> {
  const resolved = { ...defaultDependencies, ...dependencies }
  const key = formatArchiveDate(date)
  const existingCount = await locationCount(database, date)
  if (existingCount === 5) return { status: 'covered', date: key }
  if (existingCount !== 0) {
    logArchiveFailure('location_archive_inconsistent_date', date, `row_count_${existingCount}`)
    return { status: 'inconsistent', date: key, reason: `row_count_${existingCount}` }
  }

  const collection = await resolved.collectDay(date)
  if (collection.status !== 'complete') {
    logArchiveFailure('location_archive_collection_failed', date, collection.reason)
    return { status: 'unavailable', date: key, reason: collection.reason }
  }
  if (compareArchiveDates(collection.day.date, date) !== 0) {
    logArchiveFailure('location_archive_collection_failed', date, 'collected_date_mismatch')
    return { status: 'unavailable', date: key, reason: 'collected_date_mismatch' }
  }

  try {
    await insertCollectedDay(database, collection.day, resolved.now().toISOString())
    return { status: 'captured', date: key }
  } catch (error) {
    const countAfterFailure = await locationCount(database, date)
    if (countAfterFailure === 5) return { status: 'covered', date: key }
    const reason = error instanceof Error ? error.message : 'database_insert_failed'
    logArchiveFailure('location_archive_insert_failed', date, reason)
    return { status: 'unavailable', date: key, reason }
  }
}

export async function insertCollectedDay(
  database: D1Database,
  day: CollectedMapTapDay,
  collectedAt: string,
): Promise<void> {
  if (!validCollectedDay(day) || !Number.isFinite(Date.parse(collectedAt))) {
    throw new Error('invalid_collected_day')
  }
  const statements = day.locations.map((location, index) => database.prepare(
    `INSERT INTO round_locations (
       result_year, result_month, result_day, round_number,
       source_label, maptap_latitude, maptap_longitude,
       source_url, collected_at, enrichment_status, feature_types
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '[]')`,
  ).bind(
    day.date.year,
    day.date.month,
    day.date.day,
    index + 1,
    location.sourceLabel,
    location.latitude,
    location.longitude,
    day.sourceUrl,
    collectedAt,
  ))
  const results = await database.batch(statements)
  if (results.length !== 5 || results.some(({ success }) => !success)) {
    throw new Error('round_location_batch_failed')
  }
}

export async function enrichPendingLocations(
  env: Pick<Env, 'DB' | 'GOOGLE_MAPS_API_KEY'>,
  range?: { from: ArchiveDate; through: ArchiveDate },
  dependencies: Partial<ArchiveDependencies> = {},
): Promise<{ completedCount: number; pendingCount: number }> {
  const resolved = { ...defaultDependencies, ...dependencies }
  const rows = await pendingLocationRows(env.DB, range)
  const apiKey = env.GOOGLE_MAPS_API_KEY?.trim()
  if (!apiKey) {
    if (rows.length > 0) {
      console.error(JSON.stringify({
        event: 'location_enrichment_configuration_missing',
        pendingEnrichmentCount: rows.length,
      }))
    }
    return { completedCount: 0, pendingCount: rows.length }
  }

  let completedCount = 0
  for (const row of rows) {
    let result: GeocodingResult
    try {
      result = await resolved.geocode({
        sourceLabel: row.source_label,
        latitude: row.maptap_latitude,
        longitude: row.maptap_longitude,
      }, apiKey)
    } catch (error) {
      console.error(JSON.stringify({
        event: 'location_enrichment_attempt_failed',
        date: formatArchiveDate(rowDate(row)),
        roundNumber: row.round_number,
        reason: error instanceof Error ? error.message : 'enrichment_attempt_failed',
      }))
      continue
    }
    if (result.status === 'pending') {
      console.error(JSON.stringify({
        event: 'location_enrichment_failed',
        date: formatArchiveDate(rowDate(row)),
        roundNumber: row.round_number,
        reason: result.reason,
      }))
      continue
    }

    try {
      const enrichment = result.enrichment
      const update = await env.DB.prepare(
        `UPDATE round_locations SET
           geocoded_latitude = ?, geocoded_longitude = ?, continent = ?,
           country_name = ?, country_code = ?, subdivision_name = ?,
           locality_name = ?, feature_types = ?, enrichment_status = 'complete'
         WHERE result_year = ? AND result_month = ? AND result_day = ?
           AND round_number = ? AND enrichment_status = 'pending'`,
      ).bind(
        enrichment.geocodedLatitude,
        enrichment.geocodedLongitude,
        enrichment.continent,
        enrichment.countryName,
        enrichment.countryCode,
        enrichment.subdivisionName,
        enrichment.localityName,
        JSON.stringify(enrichment.featureTypes),
        row.result_year,
        row.result_month,
        row.result_day,
        row.round_number,
      ).run()
      if (!update.success) throw new Error('location_enrichment_update_failed')
      completedCount += update.meta.changes > 0 ? 1 : 0
    } catch (error) {
      console.error(JSON.stringify({
        event: 'location_enrichment_persistence_failed',
        date: formatArchiveDate(rowDate(row)),
        roundNumber: row.round_number,
        reason: error instanceof Error ? error.message : 'enrichment_persistence_failed',
      }))
    }
  }

  return {
    completedCount,
    pendingCount: await pendingLocationCount(env.DB, range),
  }
}

export async function locationArchiveHealth(
  database: D1Database,
  now = new Date(),
): Promise<LocationArchiveHealth> {
  const eligibleThrough = latestEligibleArchiveDate(now)
  const uncovered = await findUncoveredArchiveDates(database, eligibleThrough)
  const pending = await database.prepare(
    "SELECT COUNT(*) AS count FROM round_locations WHERE enrichment_status = 'pending'",
  ).first<{ count: number }>()
  return {
    status: uncovered.length === 0 ? 'ok' : 'degraded',
    locationArchive: {
      eligibleThrough: formatArchiveDate(eligibleThrough),
      uncoveredDateCount: uncovered.length,
      oldestUncoveredDate: uncovered[0] ? formatArchiveDate(uncovered[0]) : null,
      pendingEnrichmentCount: pending?.count ?? 0,
    },
  }
}

export async function findUncoveredArchiveDates(
  database: D1Database,
  through: ArchiveDate,
): Promise<ArchiveDate[]> {
  if (compareArchiveDates(through, LOCATION_ARCHIVE_START) < 0) return []
  const covered = await database.prepare(
    `SELECT result_year, result_month, result_day, COUNT(*) AS location_count
     FROM round_locations
     WHERE (result_year * 10000 + result_month * 100 + result_day) BETWEEN ? AND ?
     GROUP BY result_year, result_month, result_day
     HAVING location_count = 5
     ORDER BY result_year, result_month, result_day`,
  ).bind(dateNumber(LOCATION_ARCHIVE_START), dateNumber(through)).all<CoveredDateRow>()
  const coveredKeys = new Set(covered.results.map((row) =>
    formatArchiveDate(rowDate(row))))
  const missing: ArchiveDate[] = []
  for (let date = LOCATION_ARCHIVE_START;
    compareArchiveDates(date, through) <= 0;
    date = nextArchiveDate(date)) {
    if (!coveredKeys.has(formatArchiveDate(date))) missing.push(date)
  }
  return missing
}

async function pendingLocationRows(
  database: D1Database,
  range?: { from: ArchiveDate; through: ArchiveDate },
): Promise<PendingLocationRow[]> {
  const rangeSql = range
    ? 'AND (result_year * 10000 + result_month * 100 + result_day) BETWEEN ? AND ?'
    : ''
  const statement = database.prepare(
    `SELECT result_year, result_month, result_day, round_number,
            source_label, maptap_latitude, maptap_longitude
     FROM round_locations
     WHERE enrichment_status = 'pending' ${rangeSql}
     ORDER BY result_year, result_month, result_day, round_number`,
  )
  const bound = range
    ? statement.bind(dateNumber(range.from), dateNumber(range.through))
    : statement
  return (await bound.all<PendingLocationRow>()).results
}

async function pendingLocationCount(
  database: D1Database,
  range?: { from: ArchiveDate; through: ArchiveDate },
): Promise<number> {
  const rangeSql = range
    ? 'AND (result_year * 10000 + result_month * 100 + result_day) BETWEEN ? AND ?'
    : ''
  const statement = database.prepare(
    `SELECT COUNT(*) AS count FROM round_locations
     WHERE enrichment_status = 'pending' ${rangeSql}`,
  )
  const bound = range
    ? statement.bind(dateNumber(range.from), dateNumber(range.through))
    : statement
  return (await bound.first<{ count: number }>())?.count ?? 0
}

async function locationCount(database: D1Database, date: ArchiveDate): Promise<number> {
  const row = await database.prepare(
    `SELECT COUNT(*) AS count FROM round_locations
     WHERE result_year = ? AND result_month = ? AND result_day = ?`,
  ).bind(date.year, date.month, date.day).first<{ count: number }>()
  return row?.count ?? 0
}

function dateNumber(date: ArchiveDate): number {
  return date.year * 10_000 + date.month * 100 + date.day
}

function validCollectedDay(day: CollectedMapTapDay): boolean {
  if (day.locations.length !== 5 || day.date.year < LOCATION_ARCHIVE_START.year) return false
  const parsedDate = new Date(Date.UTC(day.date.year, day.date.month - 1, day.date.day))
  if (parsedDate.getUTCFullYear() !== day.date.year
    || parsedDate.getUTCMonth() + 1 !== day.date.month
    || parsedDate.getUTCDate() !== day.date.day) return false
  if (day.sourceUrl !== mapTapDayUrl(day.date)) return false
  return day.locations.every((location) => {
    const normalizedLabel = location.sourceLabel.trim().replace(/\s+/g, ' ')
    return normalizedLabel.length > 0 && normalizedLabel === location.sourceLabel
      && Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90
      && Number.isFinite(location.longitude) && location.longitude >= -180
      && location.longitude <= 180
  })
}

function rowDate(row: Pick<CoveredDateRow, 'result_year' | 'result_month' | 'result_day'>): ArchiveDate {
  return { year: row.result_year, month: row.result_month, day: row.result_day }
}

function logArchiveFailure(event: string, date: ArchiveDate, reason: string): void {
  console.error(JSON.stringify({ event, date: formatArchiveDate(date), reason }))
}
