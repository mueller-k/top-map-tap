const DEFAULT_MINIMUM = 500
const MAXIMUM = 1000
const TICK_INTERVAL = 100

export function scoreHistoryTooltipSortKey(item: { value?: unknown }) {
  return typeof item.value === 'number'
    ? -item.value
    : Number.POSITIVE_INFINITY
}

export function scoreHistoryYAxisMinimum(scores: number[]) {
  if (scores.length === 0) return DEFAULT_MINIMUM

  const lowestScore = Math.min(...scores)
  return Math.min(
    DEFAULT_MINIMUM,
    Math.floor(lowestScore / TICK_INTERVAL) * TICK_INTERVAL,
  )
}

export function scoreHistoryYAxisTicks(minimum: number) {
  const ticks: number[] = []
  for (let tick = minimum; tick <= MAXIMUM; tick += TICK_INTERVAL) {
    ticks.push(tick)
  }
  return ticks
}
