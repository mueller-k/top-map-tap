import { describe, expect, it } from 'vitest'
import worker, { isLocalDevelopmentHost } from './index'

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

  it('disables Turnstile configuration on local development hosts', async () => {
    const response = await worker.fetch(
      new Request('http://localhost:5173/api/config'),
      { TURNSTILE_SITE_KEY: 'test-key' } as unknown as Env,
    )

    await expect(response.json()).resolves.toEqual({
      turnstileSiteKey: 'test-key',
      turnstileRequired: false,
    })
  })

  it('requires Turnstile configuration on deployed hosts', async () => {
    const response = await worker.fetch(
      new Request('https://top-map-tap.example/api/config'),
      { TURNSTILE_SITE_KEY: 'production-key' } as unknown as Env,
    )

    await expect(response.json()).resolves.toEqual({
      turnstileSiteKey: 'production-key',
      turnstileRequired: true,
    })
  })
})

describe('isLocalDevelopmentHost', () => {
  it.each(['localhost', 'app.localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'])(
    'recognizes %s as local',
    (hostname) => {
      expect(isLocalDevelopmentHost(hostname)).toBe(true)
    },
  )

  it('does not treat a deployed hostname as local', () => {
    expect(isLocalDevelopmentHost('top-map-tap.example')).toBe(false)
  })
})
