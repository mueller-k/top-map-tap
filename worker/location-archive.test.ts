import { describe, expect, it, vi } from 'vitest'
import {
  captureArchiveDate,
  enrichPendingLocations,
  insertCollectedDay,
  locationArchiveHealth,
  runDailyLocationArchive,
} from './location-archive'
import type { ArchiveDate, CollectedMapTapDay, GeographicEnrichment } from './location-types'

describe('location archive persistence', () => {
  it('inserts the five base locations in one atomic batch with one collection time', async () => {
    const database = new ArchiveDatabase()
    await insertCollectedDay(database.binding, collectedDay({ year: 2026, month: 1, day: 1 }), '2026-01-02T12:15:00.000Z')

    expect(database.batchSizes).toEqual([5])
    expect(database.rows).toHaveLength(5)
    expect(new Set(database.rows.map(({ collected_at }) => collected_at))).toEqual(
      new Set(['2026-01-02T12:15:00.000Z']),
    )
    expect(database.rows.every(({ enrichment_status }) => enrichment_status === 'pending')).toBe(true)
  })

  it('captures the newest date first, retries older gaps, then enriches pending rows', async () => {
    const database = new ArchiveDatabase()
    await insertCollectedDay(database.binding, collectedDay({ year: 2026, month: 1, day: 1 }), '2026-01-02T12:15:00.000Z')
    const collectionOrder: string[] = []
    const summary = await runDailyLocationArchive(
      { DB: database.binding, GOOGLE_MAPS_API_KEY: 'secret' } as Env,
      new Date('2026-01-04T12:15:00Z'),
      {
        collectDay: async (date) => {
          collectionOrder.push(`${date.month}-${date.day}`)
          return { status: 'complete', day: collectedDay(date) }
        },
        geocode: async () => ({ status: 'complete', enrichment: enrichment() }),
        now: () => new Date('2026-01-04T12:15:00Z'),
      },
    )

    expect(collectionOrder).toEqual(['1-3', '1-2'])
    expect(summary).toMatchObject({
      eligibleThrough: '2026-01-03',
      capturedDateCount: 2,
      unavailableDates: [],
      completedEnrichmentCount: 15,
      pendingEnrichmentCount: 0,
    })
    expect(database.rows).toHaveLength(15)
    expect(database.rows.every(({ enrichment_status }) => enrichment_status === 'complete')).toBe(true)
    expect(database.rows[0].maptap_latitude).toBe(11)
    expect(database.rows[0].geocoded_latitude).toBe(40)
  })

  it('keeps the first complete capture and never calls the collector again', async () => {
    const database = new ArchiveDatabase()
    await insertCollectedDay(database.binding, collectedDay({ year: 2026, month: 1, day: 1 }), '2026-01-02T12:15:00.000Z')
    const collectDay = vi.fn()

    const result = await captureArchiveDate(database.binding, { year: 2026, month: 1, day: 1 }, { collectDay })

    expect(result).toEqual({ status: 'covered', date: '2026-01-01' })
    expect(collectDay).not.toHaveBeenCalled()
    expect(database.rows[0].collected_at).toBe('2026-01-02T12:15:00.000Z')
  })

  it('keeps enrichment Pending when a completed geocoder result lacks Continent', async () => {
    const database = new ArchiveDatabase()
    await insertCollectedDay(
      database.binding,
      collectedDay({ year: 2026, month: 1, day: 1 }),
      '2026-01-02T12:15:00.000Z',
    )
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      await expect(enrichPendingLocations(
        { DB: database.binding, GOOGLE_MAPS_API_KEY: 'secret' },
        undefined,
        {
          geocode: async () => ({
            status: 'complete',
            enrichment: { ...enrichment(), continent: null },
          }),
        },
      )).resolves.toEqual({ completedCount: 0, pendingCount: 5 })
    } finally {
      log.mockRestore()
    }

    expect(database.rows.every((row) =>
      row.enrichment_status === 'pending' && row.continent === null)).toBe(true)
  })

  it('does not try to repair an impossible partial date', async () => {
    const database = new ArchiveDatabase()
    database.rows.push(rowFor({ year: 2026, month: 1, day: 1 }, 1))
    const collectDay = vi.fn()

    const result = await captureArchiveDate(database.binding, { year: 2026, month: 1, day: 1 }, { collectDay })

    expect(result).toEqual({ status: 'inconsistent', date: '2026-01-01', reason: 'row_count_1' })
    expect(collectDay).not.toHaveBeenCalled()
  })

  it('rejects a collected day whose declared date does not match the request', async () => {
    const database = new ArchiveDatabase()
    const result = await captureArchiveDate(
      database.binding,
      { year: 2026, month: 1, day: 1 },
      {
        collectDay: async () => ({
          status: 'complete',
          day: collectedDay({ year: 2026, month: 1, day: 2 }),
        }),
      },
    )

    expect(result).toEqual({
      status: 'unavailable',
      date: '2026-01-01',
      reason: 'collected_date_mismatch',
    })
    expect(database.rows).toHaveLength(0)
  })

  it('degrades health for base gaps but not pending enrichment', async () => {
    const database = new ArchiveDatabase()
    await insertCollectedDay(database.binding, collectedDay({ year: 2026, month: 1, day: 1 }), '2026-01-02T12:15:00.000Z')

    await expect(locationArchiveHealth(
      database.binding,
      new Date('2026-01-02T12:15:00Z'),
    )).resolves.toEqual({
      status: 'ok',
      locationArchive: {
        eligibleThrough: '2026-01-01',
        uncoveredDateCount: 0,
        oldestUncoveredDate: null,
        pendingEnrichmentCount: 5,
      },
    })

    await expect(locationArchiveHealth(
      database.binding,
      new Date('2026-01-03T12:15:00Z'),
    )).resolves.toEqual({
      status: 'degraded',
      locationArchive: {
        eligibleThrough: '2026-01-02',
        uncoveredDateCount: 1,
        oldestUncoveredDate: '2026-01-02',
        pendingEnrichmentCount: 5,
      },
    })
  })
})

interface StoredRow {
  result_year: number
  result_month: number
  result_day: number
  round_number: number
  source_label: string
  maptap_latitude: number
  maptap_longitude: number
  source_url: string
  collected_at: string
  enrichment_status: 'pending' | 'complete'
  geocoded_latitude: number | null
  geocoded_longitude: number | null
  continent: string | null
  country_name: string | null
  country_code: string | null
  subdivision_name: string | null
  locality_name: string | null
  feature_types: string
}

class ArchiveDatabase {
  readonly rows: StoredRow[] = []
  readonly batchSizes: number[] = []
  readonly binding: D1Database

  constructor() {
    this.binding = {
      prepare: (sql: string) => new ArchiveStatement(this, sql) as unknown as D1PreparedStatement,
      batch: async (statements: D1PreparedStatement[]) => {
        this.batchSizes.push(statements.length)
        const snapshot = [...this.rows]
        try {
          return await Promise.all(statements.map((statement) => statement.run()))
        } catch (error) {
          this.rows.splice(0, this.rows.length, ...snapshot)
          throw error
        }
      },
    } as unknown as D1Database
  }
}

class ArchiveStatement {
  private readonly values: unknown[] = []
  private readonly database: ArchiveDatabase
  private readonly sql: string

  constructor(
    database: ArchiveDatabase,
    sql: string,
  ) {
    this.database = database
    this.sql = sql
  }

  bind(...values: unknown[]) {
    this.values.push(...values)
    return this
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes("WHERE enrichment_status = 'pending'")) {
      const [from, through] = this.values as number[]
      return { count: this.database.rows.filter((row) => {
        if (row.enrichment_status !== 'pending') return false
        if (from === undefined) return true
        const number = row.result_year * 10_000 + row.result_month * 100 + row.result_day
        return number >= from && number <= through
      }).length } as T
    }
    if (this.sql.includes('SELECT COUNT(*) AS count FROM round_locations')) {
      const [year, month, day] = this.values as number[]
      return { count: this.database.rows.filter((row) =>
        row.result_year === year && row.result_month === month && row.result_day === day).length } as T
    }
    return null
  }

  async all<T>(): Promise<D1Result<T>> {
    if (this.sql.includes('GROUP BY result_year')) {
      const [from, through] = this.values as number[]
      const groups = new Map<string, StoredRow[]>()
      for (const row of this.database.rows) {
        const number = row.result_year * 10_000 + row.result_month * 100 + row.result_day
        if (number < from || number > through) continue
        const key = `${row.result_year}-${row.result_month}-${row.result_day}`
        groups.set(key, [...(groups.get(key) ?? []), row])
      }
      const results = [...groups.values()]
        .filter((rows) => rows.length === 5)
        .map((rows) => ({
          result_year: rows[0].result_year,
          result_month: rows[0].result_month,
          result_day: rows[0].result_day,
          location_count: rows.length,
        })) as T[]
      return d1Result(results)
    }
    if (this.sql.includes("enrichment_status = 'pending'")) {
      const [from, through] = this.values as number[]
      const results = this.database.rows.filter((row) => {
        if (row.enrichment_status !== 'pending') return false
        if (from === undefined) return true
        const number = row.result_year * 10_000 + row.result_month * 100 + row.result_day
        return number >= from && number <= through
      }) as T[]
      return d1Result(results)
    }
    return d1Result([])
  }

  async run<T>(): Promise<D1Result<T>> {
    if (this.sql.includes('INSERT INTO round_locations')) {
      const [year, month, day, round, label, latitude, longitude, sourceUrl, collectedAt] = this.values
      if (this.database.rows.some((row) => row.result_year === year
        && row.result_month === month && row.result_day === day && row.round_number === round)) {
        throw new Error('unique_constraint')
      }
      this.database.rows.push({
        ...rowFor({ year: year as number, month: month as number, day: day as number }, round as number),
        source_label: label as string,
        maptap_latitude: latitude as number,
        maptap_longitude: longitude as number,
        source_url: sourceUrl as string,
        collected_at: collectedAt as string,
      })
      return d1Result([], 1)
    }
    if (this.sql.includes('UPDATE round_locations SET')) {
      const [geoLat, geoLng, continent, countryName, countryCode, subdivision,
        locality, featureTypes, year, month, day, round] = this.values
      const row = this.database.rows.find((candidate) => candidate.result_year === year
        && candidate.result_month === month && candidate.result_day === day
        && candidate.round_number === round && candidate.enrichment_status === 'pending')
      if (!row) return d1Result([], 0)
      Object.assign(row, {
        geocoded_latitude: geoLat,
        geocoded_longitude: geoLng,
        continent,
        country_name: countryName,
        country_code: countryCode,
        subdivision_name: subdivision,
        locality_name: locality,
        feature_types: featureTypes,
        enrichment_status: 'complete',
      })
      return d1Result([], 1)
    }
    return d1Result([], 0)
  }
}

function d1Result<T>(results: T[], changes = 0): D1Result<T> {
  return {
    success: true,
    results,
    meta: { changes },
  } as D1Result<T>
}

function collectedDay(date: ArchiveDate): CollectedMapTapDay {
  return {
    date,
    sourceUrl: `https://maptap.gg/history/January${date.day}`,
    locations: [1, 2, 3, 4, 5].map((round) => ({
      sourceLabel: `Place ${round}`,
      latitude: 10 + round,
      longitude: -20 - round,
    })) as CollectedMapTapDay['locations'],
  }
}

function rowFor(date: ArchiveDate, round: number): StoredRow {
  return {
    result_year: date.year,
    result_month: date.month,
    result_day: date.day,
    round_number: round,
    source_label: `Place ${round}`,
    maptap_latitude: 10 + round,
    maptap_longitude: -20 - round,
    source_url: 'https://maptap.gg/history/January1',
    collected_at: 'first',
    enrichment_status: 'pending',
    geocoded_latitude: null,
    geocoded_longitude: null,
    continent: null,
    country_name: null,
    country_code: null,
    subdivision_name: null,
    locality_name: null,
    feature_types: '[]',
  }
}

function enrichment(): GeographicEnrichment {
  return {
    geocodedLatitude: 40,
    geocodedLongitude: -70,
    continent: 'North America',
    countryName: 'United States',
    countryCode: 'US',
    subdivisionName: 'Maryland',
    localityName: 'Annapolis',
    featureTypes: ['locality'],
  }
}
