import { describe, expect, it } from 'vitest'
import worker, {
  acceptedGroupMeSubmission,
  isLocalDevelopmentHost,
} from './index'

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

  it('stores only the hash of an opted-in GroupMe callback token', async () => {
    const database = fakeDatabase()
    const callbackToken = 'A'.repeat(43)
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
        groupMeLiveImport: true,
        groupMeGroupId: '1234567890',
        groupMeCallbackToken: callbackToken,
      }),
      creationEnv(database),
    )

    expect(response.status).toBe(201)
    const integration = database.batches[0].find((statement) =>
      statement.sql.includes('INSERT INTO groupme_live_imports'))
    expect(integration?.values).toContain('1234567890')
    expect(integration?.values).not.toContain(callbackToken)
    await expect(response.json()).resolves.not.toHaveProperty('callbackToken')
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

  it('accepts a valid GroupMe callback and schedules an ordered Result upsert', async () => {
    const database = fakeDatabase((sql) => {
      if (sql.includes('FROM groupme_live_imports')) {
        return {
          id: 'integration-1',
          leaderboard_id: 'leaderboard-1',
          group_id: '1234567890',
        }
      }
      return null
    })
    const response = await worker.fetch(
      groupMeCallbackRequest({
        group_id: '1234567890',
        id: 'message-1',
        name: 'Kelsey',
        sender_type: 'user',
        system: false,
        created_at: Math.floor(Date.parse('2026-06-20T12:00:00Z') / 1000),
        text: 'maptap.gg June 20\n1 2 3 4 5\nFinal score: 10',
      }),
      groupMeCallbackEnv(database),
    )

    expect(response.status).toBe(204)
    expect(database.batches).toHaveLength(1)
    expect(database.batches[0]).toHaveLength(3)
    const result = database.batches[0].find((statement) =>
      statement.sql.includes('ON CONFLICT (leaderboard_id'))
    expect(result?.sql).toContain('groupme_message_receipts')
    expect(result?.values).toContain('message-1')
    expect(result?.values).toContain('groupme')
  })

  it('silently discards a callback from the wrong GroupMe group', async () => {
    const database = fakeDatabase((sql) => {
      if (sql.includes('FROM groupme_live_imports')) {
        return {
          id: 'integration-1',
          leaderboard_id: 'leaderboard-1',
          group_id: 'expected-group',
        }
      }
      return null
    })
    const response = await worker.fetch(
      groupMeCallbackRequest({
        group_id: 'different-group',
        id: 'message-1',
        name: 'Kelsey',
        sender_type: 'user',
        system: false,
        created_at: Math.floor(Date.parse('2026-06-20T12:00:00Z') / 1000),
        text: 'maptap.gg June 20\n1 2 3 4 5\nFinal score: 10',
      }),
      groupMeCallbackEnv(database),
    )

    expect(response.status).toBe(204)
    expect(database.batches).toHaveLength(0)
  })
})

describe('acceptedGroupMeSubmission', () => {
  const now = new Date('2026-06-21T12:00:00Z')

  it('uses the message year and normalized sender name', () => {
    const submission = acceptedGroupMeSubmission({
      group_id: '123',
      id: 'message-1',
      name: '  KELSEY   Morrison ',
      sender_type: 'user',
      system: false,
      created_at: Math.floor(Date.parse('2025-12-31T23:59:00Z') / 1000),
      text: 'maptap.gg December 31\n1 2 3 4 5\nFinal score: 10',
    }, '123', now)

    expect(submission).toMatchObject({
      participantDisplayName: 'KELSEY Morrison',
      participantNormalizedName: 'kelsey morrison',
      submissionTime: '2025-12-31T23:59:00.000Z',
      parsed: { date: { year: 2025, month: 12, day: 31 } },
    })
  })

  it('rejects messages more than five minutes in the future', () => {
    expect(acceptedGroupMeSubmission({
      group_id: '123',
      id: 'message-1',
      name: 'Kelsey',
      sender_type: 'user',
      system: false,
      created_at: Math.floor(Date.parse('2026-06-21T12:05:01Z') / 1000),
      text: 'maptap.gg June 21\n1 2 3 4 5\nFinal score: 10',
    }, '123', now)).toBeNull()
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

function fakeDatabase(
  firstResult: (sql: string, values: unknown[]) => unknown = () => null,
) {
  const batches: FakeStatement[][] = []
  const binding = {
    prepare(sql: string) {
      return new FakeStatement(sql, firstResult)
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

function groupMeCallbackRequest(body: Record<string, unknown>) {
  return new Request(`http://localhost/api/groupme-callbacks/${'A'.repeat(43)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function groupMeCallbackEnv(database: ReturnType<typeof fakeDatabase>) {
  return {
    DB: database.binding,
    GROUPME_CALLBACK_RATE_LIMIT: {
      limit: async () => ({ success: true }),
    },
  } as unknown as Env
}

class FakeStatement {
  readonly values: unknown[] = []
  readonly sql: string
  readonly firstResult: (sql: string, values: unknown[]) => unknown

  constructor(
    sql: string,
    firstResult: (sql: string, values: unknown[]) => unknown,
  ) {
    this.sql = sql
    this.firstResult = firstResult
  }

  bind(...values: unknown[]) {
    this.values.push(...values)
    return this
  }

  async first() {
    return this.firstResult(this.sql, this.values)
  }
}
