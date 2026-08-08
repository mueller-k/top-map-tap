import {
  captureArchiveDate,
  enrichPendingLocations,
  findUncoveredArchiveDates,
  LOCATION_ARCHIVE_START,
  locationArchiveHealth,
} from './location-archive'
import {
  compareArchiveDates,
  formatArchiveDate,
  latestEligibleArchiveDate,
  nextArchiveDate,
  parseArchiveDate,
  type ArchiveDate,
} from './location-types'

// One date keeps each Worker invocation bounded even when all five Google
// calls exhaust their retries. The CLI advances the cursor without a total cap.
const BATCH_DATE_COUNT = 1

type BackfillEnv = Env & { BACKFILL_TOKEN: string }

export default {
  async fetch(request: Request, env: BackfillEnv): Promise<Response> {
    const url = new URL(request.url)
    if (request.method !== 'POST' || url.pathname !== '/backfill') {
      return response({ error: 'not_found' }, 404)
    }
    if (!env.BACKFILL_TOKEN
      || request.headers.get('authorization') !== `Bearer ${env.BACKFILL_TOKEN}`) {
      return response({ error: 'forbidden' }, 403)
    }

    try {
      const cursor = url.searchParams.get('after')
      const after = cursor ? parseArchiveDate(cursor) : null
      if (cursor && !after) return response({ error: 'invalid_cursor' }, 400)

      const through = latestEligibleArchiveDate(new Date())
      const from = after ? nextArchiveDate(after) : LOCATION_ARCHIVE_START
      if (after && compareArchiveDates(after, LOCATION_ARCHIVE_START) < 0) {
        return response({ error: 'invalid_cursor' }, 400)
      }
      if (compareArchiveDates(from, through) > 0) {
        return finalResponse(env.DB, through)
      }

      const dates = datesFrom(from, through, BATCH_DATE_COUNT)
      const results = []
      for (const date of dates) results.push(await captureArchiveDate(env.DB, date))
      const enrichment = await enrichPendingLocations(env, {
        from: dates[0],
        through: dates[dates.length - 1],
      })
      const lastDate = dates[dates.length - 1]
      const done = compareArchiveDates(lastDate, through) >= 0
      if (done) {
        const final = await finalPayload(env.DB, through)
        return response({
          done: true,
          processedThrough: formatArchiveDate(lastDate),
          results,
          batchEnrichment: enrichment,
          ...final,
        })
      }
      return response({
        done: false,
        processedThrough: formatArchiveDate(lastDate),
        results,
        batchEnrichment: enrichment,
      })
    } catch (error) {
      console.error(JSON.stringify({
        event: 'location_archive_backfill_failed',
        error: error instanceof Error ? error.message : String(error),
      }))
      return response({ error: 'backfill_failed' }, 500)
    }
  },
} satisfies ExportedHandler<BackfillEnv>

async function finalResponse(database: D1Database, through: ArchiveDate): Promise<Response> {
  return response({ done: true, processedThrough: null, ...(await finalPayload(database, through)) })
}

async function finalPayload(database: D1Database, through: ArchiveDate) {
  const missing = await findUncoveredArchiveDates(database, through)
  const health = await locationArchiveHealth(database)
  return {
    eligibleThrough: formatArchiveDate(through),
    uncoveredDates: missing.map(formatArchiveDate),
    pendingEnrichmentCount: health.locationArchive.pendingEnrichmentCount,
  }
}

function datesFrom(from: ArchiveDate, through: ArchiveDate, limit: number): ArchiveDate[] {
  const dates: ArchiveDate[] = []
  for (let date = from; compareArchiveDates(date, through) <= 0 && dates.length < limit;
    date = nextArchiveDate(date)) {
    dates.push(date)
  }
  return dates
}

function response(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
