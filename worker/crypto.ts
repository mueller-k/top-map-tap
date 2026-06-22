const encoder = new TextEncoder()
const PASSWORD_ITERATIONS = 100_000

export interface PasswordHash {
  algorithm: 'PBKDF2-SHA-256'
  iterations: number
  salt: string
  hash: string
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16)
  return {
    algorithm: 'PBKDF2-SHA-256',
    iterations: PASSWORD_ITERATIONS,
    salt: toBase64Url(salt),
    hash: toBase64Url(await derivePassword(password, salt, PASSWORD_ITERATIONS)),
  }
}

export async function verifyPassword(
  password: string,
  stored: PasswordHash,
): Promise<boolean> {
  const actual = await derivePassword(
    password,
    fromBase64Url(stored.salt),
    stored.iterations,
  )
  const expected = fromBase64Url(stored.hash)
  return actual.byteLength === expected.byteLength &&
    crypto.subtle.timingSafeEqual(actual, expected)
}

export async function sha256(value: string): Promise<string> {
  return toBase64Url(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

export async function verifySha256(
  value: string,
  expectedHash: string,
): Promise<boolean> {
  const actual = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  const expected = fromBase64Url(expectedHash)
  return actual.byteLength === expected.byteLength &&
    crypto.subtle.timingSafeEqual(actual, expected)
}

export function randomToken(byteLength = 32): string {
  return toBase64Url(randomBytes(byteLength))
}

export function randomLeaderboardId(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const bytes = randomBytes(12)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  )
}

function randomBytes(length: number): Uint8Array {
  const value = new Uint8Array(length)
  crypto.getRandomValues(value)
  return value
}

function toBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/gu, '+').replace(/_/gu, '/').padEnd(
    Math.ceil(value.length / 4) * 4,
    '=',
  )
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
