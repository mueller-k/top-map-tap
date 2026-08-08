import { continentForCountryCode } from './continents'
import { readBoundedText, retryAfterMilliseconds, sleep, type Sleep } from './fetch-utils'
import type { GeographicEnrichment, MapTapLocation } from './location-types'

const GEOCODING_ENDPOINT = 'https://geocode.googleapis.com/v4/geocode/location'
const MAX_GEOCODING_BODY_BYTES = 512 * 1024
const MAX_RETRY_AFTER_MS = 5_000
const FIELD_MASK = [
  'results.types',
  'results.addressComponents.longText',
  'results.addressComponents.shortText',
  'results.addressComponents.types',
  'results.location',
].join(',')

type Fetcher = typeof fetch

export type GeocodingResult =
  | { status: 'complete'; enrichment: GeographicEnrichment }
  | { status: 'pending'; reason: string }

export async function reverseGeocode(
  location: MapTapLocation,
  apiKey: string,
  options: { fetcher?: Fetcher; sleep?: Sleep } = {},
): Promise<GeocodingResult> {
  const fetcher = options.fetcher ?? fetch
  const wait = options.sleep ?? sleep
  const url = new URL(GEOCODING_ENDPOINT)
  url.searchParams.set('location.latitude', String(location.latitude))
  url.searchParams.set('location.longitude', String(location.longitude))
  url.searchParams.set('languageCode', 'en')

  for (let attempt = 0; attempt < 6; attempt += 1) {
    let response: Response
    try {
      response = await fetcher(url, {
        headers: {
          accept: 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
      })
    } catch {
      if (attempt === 5) return { status: 'pending', reason: 'google_network_error' }
      await wait(backoff(attempt))
      continue
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt === 5) {
        await response.body?.cancel()
        return { status: 'pending', reason: `google_http_${response.status}` }
      }
      await response.body?.cancel()
      await wait(retryAfterMilliseconds(response, MAX_RETRY_AFTER_MS) ?? backoff(attempt))
      continue
    }

    try {
      const body = await readBoundedText(response, MAX_GEOCODING_BODY_BYTES)
      return { status: 'complete', enrichment: parseGeocodingResponse(JSON.parse(body)) }
    } catch {
      if (attempt === 5) return { status: 'pending', reason: 'google_invalid_response' }
      await wait(backoff(attempt))
    }
  }

  return { status: 'pending', reason: 'google_unavailable' }
}

export function parseGeocodingResponse(value: unknown): GeographicEnrichment {
  if (!isRecord(value) || (value.results !== undefined && !Array.isArray(value.results))) {
    throw new Error('invalid_geocoding_response')
  }
  if (value.results === undefined && Object.keys(value).length !== 0) {
    throw new Error('invalid_geocoding_response')
  }
  const results = value.results ?? []
  if (!Array.isArray(results) || results.length === 0) return emptyEnrichment()

  const featureTypes = new Set<string>()
  let countryName: string | null = null
  let countryCode: string | null = null
  let subdivisionName: string | null = null
  let locality: string | null = null
  let postalTown: string | null = null
  let sublocality: string | null = null
  let geocodedLatitude: number | null = null
  let geocodedLongitude: number | null = null

  for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
    const result = results[resultIndex]
    if (!isRecord(result)) throw new Error('invalid_geocoding_result')
    if (result.types !== undefined
      && (!Array.isArray(result.types) || !result.types.every((type) => typeof type === 'string'))) {
      throw new Error('invalid_geocoding_types')
    }
    if (Array.isArray(result.types)) {
      for (const type of result.types) featureTypes.add(type)
    }

    if (resultIndex === 0 && result.location !== undefined) {
      if (isRecord(result.location)
        && validLatitude(result.location.latitude)
        && validLongitude(result.location.longitude)) {
        geocodedLatitude = result.location.latitude
        geocodedLongitude = result.location.longitude
      }
    }

    if (result.addressComponents === undefined) continue
    if (!Array.isArray(result.addressComponents)) {
      throw new Error('invalid_address_components')
    }
    for (const component of result.addressComponents) {
      if (!isRecord(component)) throw new Error('invalid_address_component')
      if (component.types !== undefined
        && (!Array.isArray(component.types)
          || !component.types.every((type) => typeof type === 'string'))) {
        throw new Error('invalid_address_component')
      }
      if (typeof component.longText !== 'string' || !Array.isArray(component.types)) continue
      const longText = optionalText(component.longText)
      if (component.types.includes('country') && !countryName) {
        countryName = longText
        const shortText = typeof component.shortText === 'string'
          ? component.shortText.toUpperCase()
          : ''
        countryCode = /^[A-Z]{2}$/.test(shortText)
          && continentForCountryCode(shortText) !== null
          ? shortText
          : null
      }
      if (component.types.includes('administrative_area_level_1') && !subdivisionName) {
        subdivisionName = longText
      }
      if (component.types.includes('locality') && !locality) locality = longText
      if (component.types.includes('postal_town') && !postalTown) postalTown = longText
      if (component.types.includes('sublocality_level_1') && !sublocality) sublocality = longText
    }
  }

  return {
    geocodedLatitude,
    geocodedLongitude,
    continent: continentForCountryCode(countryCode),
    countryName,
    countryCode,
    subdivisionName,
    localityName: locality ?? postalTown ?? sublocality,
    featureTypes: [...featureTypes].sort(),
  }
}

function emptyEnrichment(): GeographicEnrichment {
  return {
    geocodedLatitude: null,
    geocodedLongitude: null,
    continent: null,
    countryName: null,
    countryCode: null,
    subdivisionName: null,
    localityName: null,
    featureTypes: [],
  }
}

function optionalText(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized || null
}

function backoff(attempt: number): number {
  return Math.min(250 * 2 ** attempt, MAX_RETRY_AFTER_MS)
}

function validLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90
}

function validLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
