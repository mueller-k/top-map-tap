import {
  isValidName,
  normalizeName,
  type MapTapDate,
} from './domain'
import { parseMapTapResult } from './parser'

export const MAX_IMPORT_RESULTS = 250

export interface GroupMeImportCandidate {
  system: false
  sender_type: 'user'
  name: string
  text: string
  created_at: number
  position: number
}

export interface ImportedParticipant {
  displayName: string
  normalizedName: string
  createdAt: string
}

export interface ImportedResult {
  participantNormalizedName: string
  date: MapTapDate
  roundScores: [number, number, number, number, number]
  finalScore: number
  sourceText: string
  createdAt: string
}

export interface ImportSummary {
  resultCount: number
  participantNames: string[]
  dateRange: {
    earliest: Pick<MapTapDate, 'year' | 'month' | 'day'>
    latest: Pick<MapTapDate, 'year' | 'month' | 'day'>
  } | null
}

export interface ProcessedGroupMeImport {
  candidates: GroupMeImportCandidate[]
  participants: ImportedParticipant[]
  results: ImportedResult[]
  summary: ImportSummary
}

export type GroupMeImportResult =
  | { ok: true; value: ProcessedGroupMeImport }
  | {
      ok: false
      code:
        | 'INVALID_IMPORT'
        | 'NO_RESULTS'
        | 'TOO_MANY_RESULTS'
        | 'TOO_MANY_PARTICIPANTS'
    }

interface ParsedCandidate {
  candidate: GroupMeImportCandidate
  displayName: string
  normalizedName: string
  timestamp: Date
  parsed: Extract<ReturnType<typeof parseMapTapResult>, { ok: true }>['value']
}

export function processGroupMeExport(
  messages: unknown[],
  now = new Date(),
): GroupMeImportResult {
  const candidates = messages.flatMap((message, position) => {
    const candidate = groupMeCandidate(message, position)
    return candidate ? [candidate] : []
  })
  return processValidatedCandidates(candidates, now, false)
}

export function processGroupMeCandidates(
  values: unknown[],
  now = new Date(),
): GroupMeImportResult {
  const candidates: GroupMeImportCandidate[] = []
  const positions = new Set<number>()
  for (const value of values) {
    const candidate = submittedGroupMeCandidate(value)
    if (!candidate || positions.has(candidate.position)) {
      return { ok: false, code: 'INVALID_IMPORT' }
    }
    positions.add(candidate.position)
    candidates.push(candidate)
  }
  return processValidatedCandidates(candidates, now, true)
}

function processValidatedCandidates(
  candidates: GroupMeImportCandidate[],
  now: Date,
  rejectInvalid: boolean,
): GroupMeImportResult {
  const currentYear = now.getUTCFullYear()
  const parsedCandidates: ParsedCandidate[] = []

  for (const candidate of candidates) {
    const timestamp = new Date(candidate.created_at * 1000)
    if (
      !Number.isFinite(timestamp.getTime()) ||
      timestamp.getTime() > now.getTime() ||
      timestamp.getUTCFullYear() < 2000 ||
      !isValidName(candidate.name, 30)
    ) {
      if (rejectInvalid) return { ok: false, code: 'INVALID_IMPORT' }
      continue
    }
    const parsed = parseMapTapResult(
      candidate.text,
      timestamp.getUTCFullYear(),
      currentYear,
    )
    if (!parsed.ok) {
      if (rejectInvalid) return { ok: false, code: 'INVALID_IMPORT' }
      continue
    }
    const name = normalizeName(candidate.name)
    parsedCandidates.push({
      candidate,
      displayName: name.display,
      normalizedName: name.normalized,
      timestamp,
      parsed: parsed.value,
    })
  }

  const deduplicated = new Map<string, ParsedCandidate>()
  for (const candidate of parsedCandidates) {
    const date = candidate.parsed.date
    const key = `${candidate.normalizedName}:${date.year}-${date.month}-${date.day}`
    const previous = deduplicated.get(key)
    if (
      !previous ||
      candidate.candidate.created_at > previous.candidate.created_at ||
      (
        candidate.candidate.created_at === previous.candidate.created_at &&
        candidate.candidate.position > previous.candidate.position
      )
    ) {
      deduplicated.set(key, candidate)
    }
  }

  const surviving = [...deduplicated.values()]
  if (!surviving.length) return { ok: false, code: 'NO_RESULTS' }
  if (surviving.length > MAX_IMPORT_RESULTS) {
    return { ok: false, code: 'TOO_MANY_RESULTS' }
  }

  const participantCandidates = new Map<string, ParsedCandidate[]>()
  for (const candidate of surviving) {
    const entries = participantCandidates.get(candidate.normalizedName) ?? []
    entries.push(candidate)
    participantCandidates.set(candidate.normalizedName, entries)
  }
  if (participantCandidates.size > 25) {
    return { ok: false, code: 'TOO_MANY_PARTICIPANTS' }
  }

  const participants = [...participantCandidates.entries()].map(
    ([normalizedName, entries]) => {
      const ordered = [...entries].sort(compareCandidateTime)
      return {
        normalizedName,
        displayName: ordered.at(-1)!.displayName,
        createdAt: ordered[0].timestamp.toISOString(),
      }
    },
  ).sort((left, right) =>
    left.displayName.localeCompare(right.displayName, undefined, {
      sensitivity: 'base',
    }),
  )
  const displayNames = new Map(
    participants.map((participant) => [
      participant.normalizedName,
      participant.displayName,
    ]),
  )

  const results = surviving.map((candidate): ImportedResult => ({
    participantNormalizedName: candidate.normalizedName,
    date: candidate.parsed.date,
    roundScores: candidate.parsed.roundScores,
    finalScore: candidate.parsed.finalScore,
    sourceText: candidate.parsed.sourceText,
    createdAt: candidate.timestamp.toISOString(),
  }))
  const calendarDates = results
    .map((result) => result.date)
    .filter((date) => date.isCalendarDate)
    .sort(compareDates)

  return {
    ok: true,
    value: {
      candidates: surviving
        .sort((left, right) => left.candidate.position - right.candidate.position)
        .map((candidate) => candidate.candidate),
      participants,
      results,
      summary: {
        resultCount: results.length,
        participantNames: participants.map(
          (participant) => displayNames.get(participant.normalizedName)!,
        ),
        dateRange: calendarDates.length
          ? {
              earliest: dateParts(calendarDates[0]),
              latest: dateParts(calendarDates.at(-1)!),
            }
          : null,
      },
    },
  }
}

function groupMeCandidate(
  value: unknown,
  position: number,
): GroupMeImportCandidate | null {
  if (!isRecord(value)) return null
  return candidateFields(value, position)
}

function submittedGroupMeCandidate(value: unknown): GroupMeImportCandidate | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.position) || Number(value.position) < 0) {
    return null
  }
  return candidateFields(value, Number(value.position))
}

function candidateFields(
  value: Record<string, unknown>,
  position: number,
): GroupMeImportCandidate | null {
  if (
    value.system !== false ||
    value.sender_type !== 'user' ||
    typeof value.name !== 'string' ||
    typeof value.text !== 'string' ||
    typeof value.created_at !== 'number' ||
    !Number.isSafeInteger(value.created_at) ||
    value.created_at < 0
  ) {
    return null
  }
  return {
    system: false,
    sender_type: 'user',
    name: value.name,
    text: value.text,
    created_at: value.created_at,
    position,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function compareCandidateTime(left: ParsedCandidate, right: ParsedCandidate): number {
  return left.candidate.created_at - right.candidate.created_at ||
    left.candidate.position - right.candidate.position
}

function compareDates(left: MapTapDate, right: MapTapDate): number {
  return left.year - right.year || left.month - right.month || left.day - right.day
}

function dateParts(date: MapTapDate) {
  return { year: date.year, month: date.month, day: date.day }
}
