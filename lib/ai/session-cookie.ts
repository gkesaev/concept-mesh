import { assertServerOnly } from '@/lib/ai/adapters/types'
import {
  clampSessionTtl,
  decryptSessionCredentials,
  encryptSessionCredentials,
  type SessionCryptoOptions,
  type SessionProviderCredentials,
} from '@/lib/ai/session-key'

export const PROVIDER_SESSION_COOKIE = 'cm_provider_session'

export interface SessionCookieOptions extends SessionCryptoOptions {
  secure?: boolean
}

/**
 * Builds a `Set-Cookie` header value storing encrypted provider credentials in an HttpOnly cookie.
 */
export function buildProviderSessionCookie(
  credentials: SessionProviderCredentials,
  options?: SessionCookieOptions,
): string {
  assertServerOnly('buildProviderSessionCookie')
  const ttlSec = clampSessionTtl(options?.ttlSeconds)
  const token = encryptSessionCredentials(credentials, { ...options, ttlSeconds: ttlSec })
  const isSecure = options?.secure ?? (options?.env ?? process.env).NODE_ENV === 'production'

  const parts = [
    `${PROVIDER_SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ttlSec}`,
  ]
  if (isSecure) {
    parts.push('Secure')
  }
  return parts.join('; ')
}

/**
 * Builds a `Set-Cookie` header value that immediately clears the provider session cookie.
 */
export function buildClearProviderSessionCookie(
  options?: Pick<SessionCookieOptions, 'secure' | 'env'>,
): string {
  assertServerOnly('buildClearProviderSessionCookie')
  const isSecure = options?.secure ?? (options?.env ?? process.env).NODE_ENV === 'production'
  const parts = [
    `${PROVIDER_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ]
  if (isSecure) {
    parts.push('Secure')
  }
  return parts.join('; ')
}

/**
 * Extracts all non-empty values for a named cookie from a raw `Cookie` header.
 */
export function parseAllCookieValues(
  cookieHeader: string | null | undefined,
  name: string,
): string[] {
  if (!cookieHeader || !name) return []
  const prefix = `${name}=`
  const values: string[] = []
  for (const segment of cookieHeader.split(';')) {
    const trimmed = segment.trim()
    if (trimmed.startsWith(prefix)) {
      const value = trimmed.slice(prefix.length)
      if (value.length > 0) values.push(value)
    }
  }
  return values
}

/**
 * Extracts the first non-empty value for a named cookie from a raw `Cookie` header.
 */
export function parseCookieHeader(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  return parseAllCookieValues(cookieHeader, name)[0] ?? null
}

/**
 * Reads and decrypts provider credentials from an incoming Request's Cookie header.
 * Iterates through all matching cookie values so an empty or stale shadowed cookie cannot mask a valid one.
 */
export function readSessionCredentialsFromRequest(
  req: Request,
  options?: Pick<SessionCryptoOptions, 'nowMs' | 'env'>,
): SessionProviderCredentials | null {
  assertServerOnly('readSessionCredentialsFromRequest')
  const tokens = parseAllCookieValues(req.headers.get('cookie'), PROVIDER_SESSION_COOKIE)
  for (const token of tokens) {
    const creds = decryptSessionCredentials(token, options)
    if (creds) return creds
  }
  return null
}

/**
 * Returns a masked representation of an API key safe for display in the UI.
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return ''
  if (apiKey.length <= 12) return '••••'
  return `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`
}
