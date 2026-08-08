import { describe, expect, it, vi } from 'vitest'
import { parseGeocodingResponse, reverseGeocode } from './geocoding'

const location = {
  sourceLabel: 'Somewhere',
  latitude: 38.9784,
  longitude: -76.4922,
}

describe('Google geographic enrichment', () => {
  it('derives only the selected fields from all ordered results', () => {
    expect(parseGeocodingResponse({
      results: [
        {
          types: ['street_address', 'premise'],
          location: { latitude: 38.98, longitude: -76.49 },
          addressComponents: [
            { longText: 'Anne Arundel', shortText: 'Anne Arundel', types: ['administrative_area_level_2'] },
            { longText: '21401', shortText: '21401', types: ['postal_code'] },
          ],
        },
        {
          types: ['political', 'premise'],
          addressComponents: [
            { longText: 'United States', shortText: 'US', types: ['country', 'political'] },
            { longText: 'Maryland', shortText: 'MD', types: ['administrative_area_level_1'] },
            { longText: 'Annapolis Postal', types: ['postal_town'] },
          ],
        },
        {
          types: ['locality'],
          addressComponents: [
            { longText: 'Annapolis', types: ['locality', 'political'] },
          ],
        },
      ],
    })).toEqual({
      geocodedLatitude: 38.98,
      geocodedLongitude: -76.49,
      continent: 'North America',
      countryName: 'United States',
      countryCode: 'US',
      subdivisionName: 'Maryland',
      localityName: 'Annapolis',
      featureTypes: ['locality', 'political', 'premise', 'street_address'],
    })
  })

  it('treats an empty or partial successful response as complete', () => {
    expect(parseGeocodingResponse({})).toEqual({
      geocodedLatitude: null,
      geocodedLongitude: null,
      continent: null,
      countryName: null,
      countryCode: null,
      subdivisionName: null,
      localityName: null,
      featureTypes: [],
    })
    expect(parseGeocodingResponse({ results: [{}] })).toMatchObject({
      geocodedLatitude: null,
      countryName: null,
      featureTypes: [],
    })
  })

  it('rejects an unexpected successful payload instead of treating it as zero results', () => {
    expect(() => parseGeocodingResponse({ error: 'unexpected' })).toThrow(
      'invalid_geocoding_response',
    )
  })

  it('does not retain an unrecognized country code', () => {
    expect(parseGeocodingResponse({ results: [{
      addressComponents: [{ longText: 'Unknownland', shortText: 'XX', types: ['country'] }],
    }] })).toMatchObject({
      countryName: 'Unknownland',
      countryCode: null,
      continent: null,
    })
  })

  it('sends an English, field-masked v4 request and retries retryable failures five times', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 504 }))
      .mockResolvedValueOnce(Response.json({ results: [] }))
    const wait = vi.fn().mockResolvedValue(undefined)

    const result = await reverseGeocode(location, 'secret', { fetcher, sleep: wait })

    expect(result.status).toBe('complete')
    expect(fetcher).toHaveBeenCalledTimes(6)
    expect(wait).toHaveBeenCalledTimes(5)
    expect(wait).toHaveBeenNthCalledWith(1, 1_000)
    const [requestUrl, init] = fetcher.mock.calls[0]
    const url = new URL(String(requestUrl))
    expect(url.origin + url.pathname).toBe('https://geocode.googleapis.com/v4/geocode/location')
    expect(url.searchParams.get('languageCode')).toBe('en')
    expect(url.searchParams.get('location.latitude')).toBe('38.9784')
    expect(new Headers(init.headers).get('X-Goog-Api-Key')).toBe('secret')
    expect(new Headers(init.headers).get('X-Goog-FieldMask')).not.toContain('formattedAddress')
  })

  it('does not retry authentication or invalid-request failures', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 400 }))
    const result = await reverseGeocode(location, 'bad-key', {
      fetcher,
      sleep: vi.fn().mockResolvedValue(undefined),
    })
    expect(result).toEqual({ status: 'pending', reason: 'google_http_400' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
