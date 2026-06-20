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

  it('creates a leaderboard atomically with an explicit no-import branch', async () => {
    const database = fakeDatabase()
    const response = await worker.fetch(
      new Request('http://localhost/api/leaderboards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Map-Tap-Request': '1',
        },
        body: JSON.stringify({
          name: 'Map friends',
          password: 'password1',
          confirmPassword: 'password1',
          turnstileToken: '',
          importSource: 'none',
        }),
      }),
      {
        DB: database.binding,
        CREATE_RATE_LIMIT: { limit: async () => ({ success: true }) },
      } as unknown as Env,
    )

    expect(response.status).toBe(201)
    expect(database.batches).toHaveLength(1)
    expect(database.batches[0]).toHaveLength(3)
  })

  it('rejects an ambiguous creation request without an import source', async () => {
    const database = fakeDatabase()
    const response = await worker.fetch(
      creationRequest({
        name: 'Map friends',
        password: 'password1',
        confirmPassword: 'password1',
        turnstileToken: '',
      }),
      creationEnv(database),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'INVALID_IMPORT_SOURCE',
        message: 'Choose a valid import source.',
      },
    })
    expect(database.batches).toHaveLength(0)
  })

  it('atomically creates imported Participants and Results after matching the preview', async () => {
    const database = fakeDatabase()
    const text = 'maptap.gg June 19, 2026\n1 2 3 4 5\nFinal score: 10'
    const response = await worker.fetch(
      creationRequest({
        name: 'Map friends',
        password: 'password1',
        confirmPassword: 'password1',
        turnstileToken: '',
        importSource: 'groupme',
        importCandidates: [{
          system: false,
          sender_type: 'user',
          name: 'Kelsey',
          text,
          created_at: 1_781_876_831,
          position: 7,
        }],
        importSummary: {
          resultCount: 1,
          participantNames: ['Kelsey'],
          dateRange: {
            earliest: { year: 2026, month: 6, day: 19 },
            latest: { year: 2026, month: 6, day: 19 },
          },
        },
      }),
      creationEnv(database),
    )

    expect(response.status).toBe(201)
    expect(database.batches).toHaveLength(1)
    expect(database.batches[0].map((statement) => statement.sql)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('INSERT INTO participants'),
        expect.stringContaining('INSERT INTO results'),
      ]),
    )
  })

  it('rejects an import when authoritative processing no longer matches the preview', async () => {
    const database = fakeDatabase()
    const response = await worker.fetch(
      creationRequest({
        name: 'Map friends',
        password: 'password1',
        confirmPassword: 'password1',
        turnstileToken: '',
        importSource: 'groupme',
        importCandidates: [{
          system: false,
          sender_type: 'user',
          name: 'Kelsey',
          text: 'maptap.gg June 19, 2026\n1 2 3 4 5\nFinal score: 10',
          created_at: 1_781_876_831,
          position: 0,
        }],
        importSummary: {
          resultCount: 2,
          participantNames: ['Kelsey'],
          dateRange: {
            earliest: { year: 2026, month: 6, day: 19 },
            latest: { year: 2026, month: 6, day: 19 },
          },
        },
      }),
      creationEnv(database),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'IMPORT_PREVIEW_MISMATCH' },
    })
    expect(database.batches).toHaveLength(0)
  })

  it('fits the maximum import within D1 query and binding limits', async () => {
    const database = fakeDatabase()
    const importCandidates = Array.from({ length: 250 }, (_, index) => {
      const participant = Math.floor(index / 25)
      const day = index % 25 + 1
      return {
        system: false,
        sender_type: 'user',
        name: `Participant ${participant}`,
        text: `maptap.gg May ${day}, 2026\n1 2 3 4 5\nFinal score: ${index}`,
        created_at: 1_780_000_000 + index,
        position: index,
      }
    })
    const response = await worker.fetch(
      creationRequest({
        name: 'Map friends',
        password: 'password1',
        confirmPassword: 'password1',
        turnstileToken: '',
        importSource: 'groupme',
        importCandidates,
        importSummary: {
          resultCount: 250,
          participantNames: Array.from(
            { length: 10 },
            (_, index) => `Participant ${index}`,
          ),
          dateRange: {
            earliest: { year: 2026, month: 5, day: 1 },
            latest: { year: 2026, month: 5, day: 25 },
          },
        },
      }),
      creationEnv(database),
    )

    expect(response.status).toBe(201)
    expect(database.batches[0].length).toBeLessThanOrEqual(50)
    expect(
      Math.max(...database.batches[0].map((statement) => statement.values.length)),
    ).toBeLessThanOrEqual(100)
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

function fakeDatabase() {
  const batches: FakeStatement[][] = []
  const binding = {
    prepare(sql: string) {
      return new FakeStatement(sql)
    },
    async batch(statements: FakeStatement[]) {
      batches.push(statements)
      return statements.map(() => ({ success: true }))
    },
  }
  return { binding, batches }
}

function creationRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/leaderboards', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Map-Tap-Request': '1',
    },
    body: JSON.stringify(body),
  })
}

function creationEnv(database: ReturnType<typeof fakeDatabase>) {
  return {
    DB: database.binding,
    CREATE_RATE_LIMIT: { limit: async () => ({ success: true }) },
  } as unknown as Env
}

class FakeStatement {
  readonly values: unknown[] = []
  readonly sql: string

  constructor(sql: string) {
    this.sql = sql
  }

  bind(...values: unknown[]) {
    this.values.push(...values)
    return this
  }

  async first() {
    return null
  }
}
