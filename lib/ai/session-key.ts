import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import {
  PROVIDER_ID_PATTERN,
  ProviderError,
  assertServerOnly,
  isValidModelId,
  sanitizeApiKey,
} from '@/lib/ai/adapters/types'
import { validateBaseUrl } from '@/lib/ai/adapters/url-validation'

const TOKEN_VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const KEY_BYTES = 32
const MIN_SECRET_LENGTH = 32
const HKDF_SALT = 'concept-mesh:provider-session:v1'
const HKDF_INFO = 'aes-256-gcm-provider-credentials'
const MIN_TTL_SECONDS = 60
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 // 24 hours
const MAX_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days
const MAX_PAYLOAD_BYTES = 2048
const MAX_TOKEN_LENGTH = 4096
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/

export interface SessionProviderCredentials {
  providerId: string
  apiKey: string
  model?: string
  baseUrl?: string
}

interface EncryptedEnvelopePayload {
  p: string
  k: string
  m?: string
  u?: string
  iat: number
  exp: number
}

export interface SessionCryptoOptions {
  ttlSeconds?: number
  nowMs?: number
  env?: NodeJS.ProcessEnv
}

function deriveSessionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const secret = env.ENCRYPTION_KEY?.trim() || env.AUTH_SECRET?.trim()
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new ProviderError(
      'INVALID_CONFIG',
      `ENCRYPTION_KEY or AUTH_SECRET (>= ${MIN_SECRET_LENGTH} chars) is required for session encryption`,
    )
  }
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), HKDF_SALT, HKDF_INFO, KEY_BYTES))
}

function resolveNowSeconds(nowMs: number | undefined): number {
  return Math.floor((nowMs != null && Number.isFinite(nowMs) ? nowMs : Date.now()) / 1000)
}

export function clampSessionTtl(ttlSeconds: number | undefined): number {
  if (ttlSeconds == null || !Number.isFinite(ttlSeconds)) return DEFAULT_TTL_SECONDS
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(ttlSeconds)))
}

function buildEnvelopePayload(
  credentials: SessionProviderCredentials,
  options?: SessionCryptoOptions,
): EncryptedEnvelopePayload {
  if (!credentials || typeof credentials !== 'object') {
    throw new ProviderError('INVALID_CONFIG', 'credentials must be an object')
  }
  const providerId = typeof credentials.providerId === 'string' ? credentials.providerId.trim() : ''
  if (!providerId || !PROVIDER_ID_PATTERN.test(providerId)) {
    throw new ProviderError('INVALID_CONFIG', 'providerId must be a valid provider slug')
  }

  const nowSec = resolveNowSeconds(options?.nowMs)
  const payload: EncryptedEnvelopePayload = {
    p: providerId,
    k: sanitizeApiKey(credentials.apiKey),
    iat: nowSec,
    exp: nowSec + clampSessionTtl(options?.ttlSeconds),
  }

  if (credentials.model !== undefined) {
    if (typeof credentials.model !== 'string') {
      throw new ProviderError('INVALID_CONFIG', 'model must be a string', providerId)
    }
    const trimmedModel = credentials.model.trim()
    if (trimmedModel) {
      if (!isValidModelId(trimmedModel)) {
        throw new ProviderError('INVALID_CONFIG', 'model must be a valid model identifier', providerId)
      }
      payload.m = trimmedModel
    }
  }

  if (credentials.baseUrl !== undefined) {
    if (typeof credentials.baseUrl !== 'string') {
      throw new ProviderError('INVALID_CONFIG', 'baseUrl must be a string', providerId)
    }
    if (credentials.baseUrl.trim() !== '') {
      payload.u = validateBaseUrl(credentials.baseUrl, { env: options?.env })
    }
  }

  return payload
}

/**
 * Encrypts provider credentials into a tamper-evident AES-256-GCM session token.
 * Designed for an HttpOnly session cookie — never persisted in the database.
 */
export function encryptSessionCredentials(
  credentials: SessionProviderCredentials,
  options?: SessionCryptoOptions,
): string {
  assertServerOnly('encryptSessionCredentials')
  const payload = buildEnvelopePayload(credentials, options)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  if (plaintext.byteLength > MAX_PAYLOAD_BYTES) {
    throw new ProviderError('INVALID_CONFIG', 'Session credentials payload exceeds size limit')
  }

  const key = deriveSessionKey(options?.env)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  cipher.setAAD(Buffer.from(TOKEN_VERSION, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [TOKEN_VERSION, iv.toString('base64url'), authTag.toString('base64url'), ciphertext.toString('base64url')].join('.')
}

/**
 * Decrypts and verifies a session credentials token.
 * Returns `null` if the token is missing, malformed, tampered, or expired.
 */
export function decryptSessionCredentials(
  token: string,
  options?: Pick<SessionCryptoOptions, 'nowMs' | 'env'>,
): SessionProviderCredentials | null {
  assertServerOnly('decryptSessionCredentials')
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null

  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION || parts.slice(1).some((p) => !BASE64URL_SEGMENT.test(p))) {
    return null
  }

  try {
    const iv = Buffer.from(parts[1], 'base64url')
    const authTag = Buffer.from(parts[2], 'base64url')
    const ciphertext = Buffer.from(parts[3], 'base64url')
    if (iv.byteLength !== IV_BYTES || authTag.byteLength !== AUTH_TAG_BYTES || ciphertext.byteLength === 0) {
      return null
    }

    const decipher = createDecipheriv(ALGORITHM, deriveSessionKey(options?.env), iv)
    decipher.setAAD(Buffer.from(TOKEN_VERSION, 'utf8'))
    decipher.setAuthTag(authTag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    const parsed = JSON.parse(plaintext) as Partial<EncryptedEnvelopePayload> | null

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.p !== 'string' ||
      !PROVIDER_ID_PATTERN.test(parsed.p) ||
      typeof parsed.k !== 'string' ||
      typeof parsed.iat !== 'number' ||
      !Number.isFinite(parsed.iat) ||
      typeof parsed.exp !== 'number' ||
      !Number.isFinite(parsed.exp) ||
      resolveNowSeconds(options?.nowMs) >= parsed.exp
    ) {
      return null
    }

    const result: SessionProviderCredentials = { providerId: parsed.p, apiKey: sanitizeApiKey(parsed.k) }
    if (typeof parsed.m === 'string' && parsed.m.length > 0) {
      if (!isValidModelId(parsed.m)) return null
      result.model = parsed.m
    }
    if (typeof parsed.u === 'string' && parsed.u.length > 0) {
      result.baseUrl = validateBaseUrl(parsed.u, { env: options?.env })
    }
    return result
  } catch {
    // Return null on tampered, malformed, or unconfigured-secret tokens so callers fall back cleanly.
    return null
  }
}
