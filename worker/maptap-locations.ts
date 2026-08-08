import { readBoundedText, sleep, type Sleep } from './fetch-utils'
import {
  formatArchiveDate,
  type ArchiveDate,
  type CollectedMapTapDay,
  type MapTapLocation,
} from './location-types'

const MAPTAP_ORIGIN = 'https://maptap.gg'
const MAX_MAPTAP_BODY_BYTES = 2 * 1024 * 1024
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

type Fetcher = typeof fetch

export type MapTapCollectionResult =
  | { status: 'complete'; day: CollectedMapTapDay }
  | { status: 'unavailable'; reason: string }

export async function collectMapTapDay(
  date: ArchiveDate,
  options: { fetcher?: Fetcher; sleep?: Sleep } = {},
): Promise<MapTapCollectionResult> {
  const fetcher = options.fetcher ?? fetch
  const wait = options.sleep ?? sleep
  const sourceUrl = mapTapDayUrl(date)
  const page = await fetchMapTapPage(sourceUrl, fetcher, wait)
  if (page.status !== 'complete') return page

  try {
    assertPageDate(page.html, date)
    if (page.html.includes('window.DAY_STORIES')) {
      const locations = await parseStoryDay(page.html, date, sourceUrl, fetcher, wait)
      return { status: 'complete', day: { date, sourceUrl, locations } }
    }
    const locations = parseLegacyDay(page.html)
    return { status: 'complete', day: { date, sourceUrl, locations } }
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'invalid_maptap_page',
    }
  }
}

export function parseLegacyMapTapPage(html: string, date: ArchiveDate): CollectedMapTapDay {
  assertPageDate(html, date)
  return {
    date,
    sourceUrl: mapTapDayUrl(date),
    locations: parseLegacyDay(html),
  }
}

export function mapTapDayUrl(date: ArchiveDate): string {
  return `${MAPTAP_ORIGIN}/history/${MONTHS[date.month - 1]}${date.day}`
}

export function normalizeSourceLabel(value: string): string {
  return decodeHtmlEntities(value).trim().replace(/\s+/g, ' ')
}

async function parseStoryDay(
  html: string,
  date: ArchiveDate,
  sourceUrl: string,
  fetcher: Fetcher,
  wait: Sleep,
): Promise<CollectedMapTapDay['locations']> {
  const stories = extractAssignedJson(html, 'window.DAY_STORIES')
  if (!Array.isArray(stories)) throw new Error('invalid_day_stories')
  const links = storyLinks(html, sourceUrl)
  const expected = new Map<number, { label: string; href: string }>()

  for (const story of stories) {
    if (!isRecord(story) || typeof story.id !== 'string'
      || !Array.isArray(story.places) || !Array.isArray(story.locIndex)
      || story.places.length !== story.locIndex.length) {
      throw new Error('invalid_day_stories')
    }
    const href = links.get(story.id)
    if (!href) throw new Error('missing_story_link')
    for (let index = 0; index < story.places.length; index += 1) {
      const roundIndex = story.locIndex[index]
      const place = story.places[index]
      if (!Number.isInteger(roundIndex) || roundIndex < 0 || roundIndex > 4
        || typeof place !== 'string' || expected.has(roundIndex)) {
        throw new Error('invalid_story_locations')
      }
      expected.set(roundIndex, { label: normalizeSourceLabel(place), href })
    }
  }
  if (expected.size !== 5) throw new Error('not_five_locations')

  const storyTargets = new Map<number, MapTapLocation>()
  const uniqueHrefs = [...new Set([...expected.values()].map(({ href }) => href))]
  const pages = await Promise.all(uniqueHrefs.map(async (href) => {
    const result = await fetchMapTapPage(href, fetcher, wait)
    if (result.status !== 'complete') throw new Error(result.reason)
    return result.html
  }))
  for (const storyHtml of pages) {
    const storyDate = extractStoryIso(storyHtml)
    if (storyDate !== formatArchiveDate(date)) throw new Error('story_date_mismatch')
    const targets = extractStoryTargets(storyHtml)
    for (const target of targets) {
      if (storyTargets.has(target.roundIndex)) throw new Error('duplicate_story_target')
      storyTargets.set(target.roundIndex, target.location)
    }
  }

  const locations: MapTapLocation[] = []
  for (let index = 0; index < 5; index += 1) {
    const expectedLocation = expected.get(index)
    const actual = storyTargets.get(index)
    if (!expectedLocation || !actual || actual.sourceLabel !== expectedLocation.label) {
      throw new Error('story_target_mismatch')
    }
    locations.push(actual)
  }
  return asFiveLocations(locations)
}

function parseLegacyDay(html: string): CollectedMapTapDay['locations'] {
  const functionIndex = html.indexOf('function getCitiesData')
  if (functionIndex < 0) throw new Error('missing_legacy_locations')
  const array = extractBalanced(html, html.indexOf('[', functionIndex), '[', ']')
  const objects = splitTopLevelObjects(array)
  const locations = objects.map((object) => {
    const name = /\bname\s*:\s*"((?:\\.|[^"\\])*)"/.exec(object)?.[1]
    const latitude = numberProperty(object, 'lat')
    const longitude = numberProperty(object, 'lng')
    if (name === undefined || latitude === null || longitude === null) {
      throw new Error('invalid_legacy_location')
    }
    return validatedLocation(decodeJavaScriptString(name), latitude, longitude)
  })
  return asFiveLocations(locations)
}

function extractStoryTargets(html: string): Array<{ roundIndex: number; location: MapTapLocation }> {
  const marker = html.indexOf('window.STORY_MAP')
  if (marker < 0) throw new Error('missing_story_map')
  const targetsMarker = html.indexOf('targets:', marker)
  if (targetsMarker < 0) throw new Error('missing_story_targets')
  const json = extractBalanced(html, html.indexOf('[', targetsMarker), '[', ']')
  const targets: unknown = JSON.parse(json)
  if (!Array.isArray(targets)) throw new Error('invalid_story_targets')
  return targets.map((target) => {
    if (!isRecord(target) || !Number.isInteger(target.locIndex)
      || typeof target.name !== 'string' || typeof target.lat !== 'number'
      || typeof target.lng !== 'number') {
      throw new Error('invalid_story_target')
    }
    return {
      roundIndex: target.locIndex as number,
      location: validatedLocation(target.name, target.lat, target.lng),
    }
  })
}

function validatedLocation(label: string, latitude: number, longitude: number): MapTapLocation {
  const sourceLabel = normalizeSourceLabel(label)
  if (!sourceLabel || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('invalid_coordinates_or_label')
  }
  return { sourceLabel, latitude, longitude }
}

function asFiveLocations(locations: MapTapLocation[]): CollectedMapTapDay['locations'] {
  if (locations.length !== 5) throw new Error('not_five_locations')
  return locations as CollectedMapTapDay['locations']
}

async function fetchMapTapPage(
  url: string,
  fetcher: Fetcher,
  wait: Sleep,
): Promise<{ status: 'complete'; html: string } | { status: 'unavailable'; reason: string }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetcher(url, {
        headers: { accept: 'text/html,application/xhtml+xml' },
        redirect: 'follow',
      })
      if (response.ok) {
        return { status: 'complete', html: await readBoundedText(response, MAX_MAPTAP_BODY_BYTES) }
      }
      if (response.status < 500 || attempt === 2) {
        await response.body?.cancel()
        return { status: 'unavailable', reason: `maptap_http_${response.status}` }
      }
      await response.body?.cancel()
    } catch (error) {
      if (attempt === 2 || (error instanceof Error && error.message === 'response_too_large')) {
        return {
          status: 'unavailable',
          reason: error instanceof Error ? error.message : 'maptap_network_error',
        }
      }
    }
    await wait(250 * 2 ** attempt)
  }
  return { status: 'unavailable', reason: 'maptap_unavailable' }
}

function assertPageDate(html: string, expected: ArchiveDate): void {
  const iso = /"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"/.exec(html)?.[1]
    ?? titleDate(html)
  if (iso !== formatArchiveDate(expected)) throw new Error('maptap_date_mismatch')
}

function titleDate(html: string): string | null {
  const match = /<title>\s*MapTap\s*[—-]\s*([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s*<\/title>/i.exec(html)
  if (!match) return null
  const month = MONTHS.findIndex((value) => value.toLowerCase() === match[1].toLowerCase()) + 1
  if (month === 0) return null
  return formatArchiveDate({ year: Number(match[3]), month, day: Number(match[2]) })
}

function extractStoryIso(html: string): string | null {
  const marker = html.indexOf('window.STORY_MAP')
  if (marker < 0) return null
  return /\biso\s*:\s*["'](\d{4}-\d{2}-\d{2})["']/.exec(html.slice(marker))?.[1] ?? null
}

function storyLinks(html: string, sourceUrl: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const match of html.matchAll(/<a\b[^>]*\bdata-story\s*=\s*["'][^"']+["'][^>]*>/gi)) {
    const tag = match[0]
    const id = /\bdata-story\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    if (id && href) result.set(id, new URL(href, sourceUrl).toString())
  }
  return result
}

function extractAssignedJson(html: string, markerText: string): unknown {
  const marker = html.indexOf(markerText)
  if (marker < 0) throw new Error('missing_json_assignment')
  const arrayStart = html.indexOf('[', marker)
  if (arrayStart < 0) throw new Error('missing_json_assignment')
  return JSON.parse(extractBalanced(html, arrayStart, '[', ']')) as unknown
}

function extractBalanced(text: string, start: number, open: string, close: string): string {
  if (start < 0 || text[start] !== open) throw new Error('missing_balanced_value')
  let depth = 0
  let quote: string | null = null
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") quote = character
    else if (character === open) depth += 1
    else if (character === close) {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1)
    }
  }
  throw new Error('unclosed_balanced_value')
}

function splitTopLevelObjects(array: string): string[] {
  const objects: string[] = []
  let start = -1
  let depth = 0
  let quote: string | null = null
  let escaped = false
  for (let index = 1; index < array.length - 1; index += 1) {
    const character = array[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") quote = character
    else if (character === '{') {
      if (depth === 0) start = index
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) objects.push(array.slice(start, index + 1))
      if (depth < 0) throw new Error('invalid_legacy_array')
    }
  }
  if (depth !== 0) throw new Error('invalid_legacy_array')
  return objects
}

function numberProperty(object: string, property: string): number | null {
  const match = new RegExp(`\\b${property}\\s*:\\s*(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?)`).exec(object)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

function decodeJavaScriptString(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/\\'/g, "'")}"`) as string
  } catch {
    throw new Error('invalid_legacy_label')
  }
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: '\u00a0', quot: '"',
  }
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, key: string) => {
    if (key[0] === '#') {
      const hexadecimal = key[1]?.toLowerCase() === 'x'
      const codePoint = Number.parseInt(key.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
      if (Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
        try { return String.fromCodePoint(codePoint) } catch { return entity }
      }
      return entity
    }
    return named[key.toLowerCase()] ?? entity
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
