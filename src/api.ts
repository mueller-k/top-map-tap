import type { ApiError } from '../shared/domain'

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string
  readonly payload?: unknown

  constructor(
    status: number,
    code: string,
    message: string,
    payload?: unknown,
  ) {
    super(message)
    this.status = status
    this.code = code
    this.payload = payload
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body) {
    headers.set('Content-Type', 'application/json')
    headers.set('X-Map-Tap-Request', '1')
  }
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = isApiError(payload)
      ? payload.error
      : { code: 'REQUEST_FAILED', message: 'Couldn’t complete the request.' }
    throw new ApiRequestError(response.status, error.code, error.message, payload)
  }
  return payload as T
}

function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== 'object' || !('error' in value)) return false
  const error = (value as { error?: unknown }).error
  return !!error && typeof error === 'object' &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
}
