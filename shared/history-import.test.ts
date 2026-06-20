import { describe, expect, it } from 'vitest'
import {
  processGroupMeCandidates,
  processGroupMeExport,
} from './history-import'

describe('processGroupMeExport', () => {
  it('derives one Result and Participant from a GroupMe user message', () => {
    const text =
      'www.maptap.gg June 19\n93🏆 95🏅 89🎓 95🏆 86🌟\nFinal score: 909'

    expect(processGroupMeExport([
      {
        system: false,
        sender_type: 'user',
        name: '  Kelsey   Morrison ',
        text,
        created_at: 1_781_876_831,
        ignored_extra_field: 'private chat data',
      },
    ], new Date('2026-06-20T00:00:00Z'))).toEqual({
      ok: true,
      value: {
        candidates: [{
          system: false,
          sender_type: 'user',
          name: '  Kelsey   Morrison ',
          text,
          created_at: 1_781_876_831,
          position: 0,
        }],
        participants: [{
          displayName: 'Kelsey Morrison',
          normalizedName: 'kelsey morrison',
          createdAt: '2026-06-19T13:47:11.000Z',
        }],
        results: [{
          participantNormalizedName: 'kelsey morrison',
          date: { year: 2026, month: 6, day: 19, isCalendarDate: true },
          roundScores: [93, 95, 89, 95, 86],
          finalScore: 909,
          sourceText: text,
          createdAt: '2026-06-19T13:47:11.000Z',
        }],
        summary: {
          resultCount: 1,
          participantNames: ['Kelsey Morrison'],
          dateRange: {
            earliest: { year: 2026, month: 6, day: 19 },
            latest: { year: 2026, month: 6, day: 19 },
          },
        },
      },
    })
  })

  it('keeps the latest Result per normalized Participant and MapTap Date', () => {
    const earlier =
      'maptap.gg December 31, 2025\n1 2 3 4 5\nFinal score: 10'
    const later =
      'maptap.gg December 31, 2025\n5 4 3 2 1\nFinal score: 20'

    const processed = processGroupMeExport([
      userMessage('KELSEY', earlier, 1_767_225_500),
      userMessage('Kelsey', later, 1_767_225_500),
    ], new Date('2026-01-02T00:00:00Z'))

    expect(processed).toMatchObject({
      ok: true,
      value: {
        candidates: [{ position: 1 }],
        participants: [{ displayName: 'Kelsey' }],
        results: [{
          date: { year: 2025, month: 12, day: 31 },
          finalScore: 20,
        }],
      },
    })
  })

  it('rejects malformed submitted candidates instead of silently changing the preview', () => {
    expect(processGroupMeCandidates([
      {
        ...userMessage(
          'Kelsey',
          'maptap.gg June 19\n1 2 3 4 5\nFinal score: 10',
          1_781_876_831,
        ),
        position: 0,
      },
      {
        ...userMessage(
          'Kyle',
          'maptap.gg June 19\n5 4 3 2 1\nFinal score: 20',
          1_781_876_832,
        ),
        position: 0,
      },
    ], new Date('2026-06-20T00:00:00Z'))).toEqual({
      ok: false,
      code: 'INVALID_IMPORT',
    })
  })

  it('silently ignores unrelated and unusable export records', () => {
    const processed = processGroupMeExport([
      { system: false, sender_type: 'user', name: 'Chatty', text: 'hello', created_at: 1 },
      userMessage(
        'Future',
        'maptap.gg June 19\n1 2 3 4 5\nFinal score: 10',
        4_102_444_800,
      ),
      { system: true, sender_type: 'system', name: 'GroupMe', text: 'maptap.gg June 19\n1 2 3 4 5\nFinal score: 10', created_at: 1_781_876_831 },
      userMessage(
        'Valid',
        'maptap.gg February 31\n1 2 3 4 5\nFinal score: 10',
        1_772_400_000,
      ),
    ], new Date('2026-06-20T00:00:00Z'))

    expect(processed).toMatchObject({
      ok: true,
      value: {
        summary: {
          resultCount: 1,
          participantNames: ['Valid'],
          dateRange: null,
        },
      },
    })
  })

  it('uses the latest surviving display name and earliest Result time for a Participant', () => {
    const processed = processGroupMeExport([
      userMessage(
        'kelsey',
        'maptap.gg June 18\n1 2 3 4 5\nFinal score: 10',
        1_781_790_400,
      ),
      userMessage(
        'Kelsey',
        'maptap.gg June 19\n5 4 3 2 1\nFinal score: 20',
        1_781_876_831,
      ),
    ], new Date('2026-06-20T00:00:00Z'))

    expect(processed).toMatchObject({
      ok: true,
      value: {
        participants: [{
          displayName: 'Kelsey',
          createdAt: '2026-06-18T13:46:40.000Z',
        }],
        summary: {
          resultCount: 2,
          participantNames: ['Kelsey'],
        },
      },
    })
  })

  it('accepts 250 Results and blocks the 251st without truncating', () => {
    const messages = Array.from({ length: 251 }, (_, index) => {
      const participant = Math.floor(index / 25)
      const day = index % 25 + 1
      return userMessage(
        `Participant ${participant}`,
        `maptap.gg May ${day}, 2026\n1 2 3 4 5\nFinal score: ${index}`,
        1_780_000_000 + index,
      )
    })

    expect(
      processGroupMeExport(
        messages.slice(0, 250),
        new Date('2026-06-20T00:00:00Z'),
      ),
    ).toMatchObject({ ok: true, value: { summary: { resultCount: 250 } } })
    expect(
      processGroupMeExport(messages, new Date('2026-06-20T00:00:00Z')),
    ).toEqual({ ok: false, code: 'TOO_MANY_RESULTS' })
  })
})

function userMessage(name: string, text: string, created_at: number) {
  return { system: false, sender_type: 'user', name, text, created_at }
}
