import {
  MAX_SOURCE_TEXT_LENGTH,
  isCalendarDate,
  type ParsedResult,
} from './domain'

const MONTHS = new Map<string, number>([
  ['jan', 1], ['january', 1], ['feb', 2], ['february', 2],
  ['mar', 3], ['march', 3], ['apr', 4], ['april', 4], ['may', 5],
  ['jun', 6], ['june', 6], ['jul', 7], ['july', 7], ['aug', 8],
  ['august', 8], ['sep', 9], ['sept', 9], ['september', 9],
  ['oct', 10], ['october', 10], ['nov', 11], ['november', 11],
  ['dec', 12], ['december', 12],
])

const MONTH_PATTERN =
  '(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sept|Sep|October|Oct|November|Nov|December|Dec)'
const HEADER_MARKER = /maptap\.gg/giu
const FINAL_MARKER = /final\s+score\s*:/giu

export type ParseResult =
  | { ok: true; value: ParsedResult }
  | {
      ok: false
      code:
        | 'SOURCE_TOO_LONG'
        | 'EXPECTED_ONE_HEADER'
        | 'INVALID_DATE'
        | 'EXPECTED_FIVE_ROUNDS'
        | 'ROUND_OUT_OF_RANGE'
        | 'EXPECTED_ONE_FINAL_SCORE'
        | 'FINAL_OUT_OF_RANGE'
      message: string
    }

export function parseMapTapResult(
  sourceText: string,
  defaultYear: number,
  currentYear = defaultYear,
): ParseResult {
  if (sourceText.length > MAX_SOURCE_TEXT_LENGTH) {
    return failure('SOURCE_TOO_LONG', 'Paste is too long.')
  }
  const normalized = sourceText.replace(/\r\n?/gu, '\n')
  const headerMarkers = [...normalized.matchAll(HEADER_MARKER)]
  if (headerMarkers.length !== 1) {
    return failure(
      'EXPECTED_ONE_HEADER',
      'Paste exactly one MapTap result, including its maptap.gg header.',
    )
  }
  const headerIndex = headerMarkers[0].index
  const headerStart = normalized.lastIndexOf('\n', headerIndex) + 1
  const headerEndValue = normalized.indexOf('\n', headerIndex)
  const headerEnd = headerEndValue === -1 ? normalized.length : headerEndValue
  const headerLine = normalized.slice(headerStart, headerEnd)
  const dateMatch = new RegExp(
    `maptap\\.gg.*?${MONTH_PATTERN}\\s+(\\d{1,2})(?:\\s*,?\\s*(\\d{4}))?`,
    'iu',
  ).exec(headerLine)
  if (!dateMatch) {
    return failure('INVALID_DATE', 'The MapTap header needs an English month and day.')
  }
  const month = MONTHS.get(dateMatch[1].toLocaleLowerCase('en-US'))
  const day = Number(dateMatch[2])
  const year = dateMatch[3] ? Number(dateMatch[3]) : defaultYear
  if (!month || day < 1 || day > 31 || year < 2000 || year > currentYear + 1) {
    return failure('INVALID_DATE', 'The MapTap date is outside the accepted range.')
  }

  const finalMarkers = [...normalized.matchAll(FINAL_MARKER)]
  if (finalMarkers.length !== 1) {
    return failure('EXPECTED_ONE_FINAL_SCORE', 'Paste exactly one “Final score:” line.')
  }
  const finalIndex = finalMarkers[0].index
  if (finalIndex < headerEnd) {
    return failure('EXPECTED_FIVE_ROUNDS', 'The five round scores are missing.')
  }
  const roundTokens = normalized.slice(headerEnd, finalIndex).match(/\d+/gu) ?? []
  if (roundTokens.length !== 5) {
    return failure(
      'EXPECTED_FIVE_ROUNDS',
      'Expected exactly five round scores between the header and final score.',
    )
  }
  const roundScores = roundTokens.map(Number)
  if (roundScores.some((score) => score < 0 || score > 100)) {
    return failure('ROUND_OUT_OF_RANGE', 'Round scores must be from 0 to 100.')
  }

  const finalMatch = /^final\s+score\s*:\s*(\d+)/iu.exec(normalized.slice(finalIndex))
  if (!finalMatch) {
    return failure('EXPECTED_ONE_FINAL_SCORE', 'The Final score needs an integer.')
  }
  const finalScore = Number(finalMatch[1])
  if (finalScore < 0 || finalScore > 1000) {
    return failure('FINAL_OUT_OF_RANGE', 'Final score must be from 0 to 1000.')
  }

  return {
    ok: true,
    value: {
      date: { year, month, day, isCalendarDate: isCalendarDate({ year, month, day }) },
      roundScores: roundScores as [number, number, number, number, number],
      finalScore,
      sourceText,
    },
  }
}

function failure(code: Extract<ParseResult, { ok: false }>['code'], message: string) {
  return { ok: false as const, code, message }
}
