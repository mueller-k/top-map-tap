import { dateKey, type MapTapDate } from '../shared/domain'

export function formatDate(date: MapTapDate, options: Intl.DateTimeFormatOptions = {}) {
  if (!date.isCalendarDate) {
    return `${monthName(date.month)} ${date.day}, ${date.year}`
  }
  const value = new Date(`${dateKey(date)}T12:00:00Z`)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
    ...options,
  }).format(value)
}

export function relativeTime(value: string): string {
  const difference = Date.now() - new Date(value).getTime()
  if (difference < 60_000) return 'Just now'
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)} min ago`
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)} hr ago`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
    .format(new Date(value))
}

function monthName(month: number): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2026, month - 1, 1)))
}

