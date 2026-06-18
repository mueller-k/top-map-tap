import { describe, expect, it } from 'vitest'
import worker from './index'

describe('worker', () => {
  it('serves a minimal health response with security headers', async () => {
    const response = await worker.fetch(
      new Request('https://top-map-tap.example/api/health'),
      {} as Env,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'",
    )
  })
})
