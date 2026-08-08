import { describe, expect, it, vi } from 'vitest'
import {
  collectMapTapDay,
  normalizeSourceLabel,
  parseLegacyMapTapPage,
} from './maptap-locations'

const januaryFirst = { year: 2026, month: 1, day: 1 }

describe('MapTap location collection', () => {
  it('parses exactly five legacy locations without retaining editorial fields', () => {
    const parsed = parseLegacyMapTapPage(legacyPage(), januaryFirst)

    expect(parsed.sourceUrl).toBe('https://maptap.gg/history/January1')
    expect(parsed.locations).toEqual([
      { sourceLabel: 'One & Only', latitude: 1.1, longitude: -1.2 },
      { sourceLabel: 'Two', latitude: 2, longitude: -2 },
      { sourceLabel: 'Three', latitude: 3, longitude: -3 },
      { sourceLabel: 'Four', latitude: 4, longitude: -4 },
      { sourceLabel: 'Five', latitude: 5, longitude: -5 },
    ])
    expect(JSON.stringify(parsed)).not.toContain('Trivia that is never retained')
  })

  it('resolves current story pages transiently and returns only ordered locations', async () => {
    const dayHtml = `
      <title>MapTap — August 5, 2026</title>
      ${[0, 1, 2, 3, 4].map((index) =>
        `<a class="row" href="/history/2026/August5/story-${index}.html" data-story="story-${index}"></a>`).join('')}
      <script>window.DAY_STORIES = ${JSON.stringify([0, 1, 2, 3, 4].map((index) => ({
        id: `story-${index}`,
        places: [index === 0 ? 'Place &amp; One' : `Place ${index + 1}`],
        locIndex: [index],
      })))};</script>`
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://maptap.gg/history/August5') return new Response(dayHtml)
      const match = /story-(\d+)\.html$/.exec(url)
      if (!match) return new Response(null, { status: 404 })
      const index = Number(match[1])
      const name = index === 0 ? 'Place &amp; One' : `Place ${index + 1}`
      return new Response(`<script>window.STORY_MAP = { iso: "2026-08-05", targets: [{"lat":${index + 10},"lng":${-(index + 20)},"name":${JSON.stringify(name)},"locIndex":${index}}] };</script>`)
    })

    const result = await collectMapTapDay(
      { year: 2026, month: 8, day: 5 },
      { fetcher, sleep: vi.fn() },
    )

    expect(result.status).toBe('complete')
    if (result.status !== 'complete') return
    expect(result.day.locations.map(({ sourceLabel }) => sourceLabel)).toEqual([
      'Place & One', 'Place 2', 'Place 3', 'Place 4', 'Place 5',
    ])
    expect(result.day.locations[0]).toEqual({
      sourceLabel: 'Place & One',
      latitude: 10,
      longitude: -20,
    })
    expect(JSON.stringify(result.day)).not.toContain('story-0')
  })

  it('rejects a page that does not declare the requested year', async () => {
    const result = await collectMapTapDay(januaryFirst, {
      fetcher: vi.fn().mockResolvedValue(new Response(
        legacyPage().replace('2026-01-01', '2025-01-01'),
      )),
      sleep: vi.fn(),
    })
    expect(result).toEqual({ status: 'unavailable', reason: 'maptap_date_mismatch' })
  })

  it('retries network and server failures at most three total attempts', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(legacyPage()))
    const wait = vi.fn().mockResolvedValue(undefined)

    const result = await collectMapTapDay(januaryFirst, { fetcher, sleep: wait })

    expect(result.status).toBe('complete')
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenCalledTimes(2)
  })

  it('does not repeat a missing page in the same run', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    const result = await collectMapTapDay(januaryFirst, { fetcher, sleep: vi.fn() })
    expect(result).toEqual({ status: 'unavailable', reason: 'maptap_http_404' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('normalizes only entities and whitespace in source labels', () => {
    expect(normalizeSourceLabel('  São&nbsp;Paulo &amp; area\n')).toBe('São Paulo & area')
  })
})

function legacyPage(): string {
  return `
    <script type="application/ld+json">{"datePublished":"2026-01-01"}</script>
    <script>
      function getCitiesData(){ return [
        { name: "  One &amp;   Only ", lat: 1.1, lng: -1.2, trivia: "Trivia that is never retained" },
        { name: "Two", lat: 2, lng: -2, trivia: "unused" },
        { name: "Three", lat: 3, lng: -3, trivia: "unused" },
        { name: "Four", lat: 4, lng: -4, trivia: "unused" },
        { name: "Five", lat: 5, lng: -5, trivia: "unused" }
      ]; }
    </script>`
}
