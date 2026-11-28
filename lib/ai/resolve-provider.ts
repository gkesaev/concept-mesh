import { getProvider } from '@/lib/ai/adapters/registry'
import {
  ProviderError,
  assertServerOnly,
  isValidModelId,
  sanitizeApiKey,
  type ProviderAdapter,
} from '@/lib/ai/adapters/types'
import { validateBaseUrl } from '@/lib/ai/adapters/url-validation'
import { readSessionCredentialsFromRequest } from '@/lib/ai/session-cookie'
import type { SessionProviderCredentials } from '@/lib/ai/session-key'

export type CredentialSource =
  | 'request'
  | 'session'
  | 'user-db'
  | 'env-default'
  | 'env-anthropic'
  | 'none'

export interface RequestProviderConfig {
  providerId?: string
  apiKey?: string
  model?: string
  baseUrl?: string
}

export interface ResolveProviderOptions {
  /** Per-request provider configuration supplied by the caller (never stored in DB). */
  requestConfig?: RequestProviderConfig
  /** Incoming Request used to read the encrypted HttpOnly session cookie. */
  request?: Request
  /** Pre-decrypted session credentials (overrides reading from `request`). */
  sessionCredentials?: SessionProviderCredentials | null
  /** Optional fallback loader for legacy DB-stored Anthropic keys (`users.encrypted_api_key`). */
  loadLegacyUserApiKey?: () => Promise<string | null>
  /** Optional env override (primarily for deterministic testing). */
  env?: NodeJS.ProcessEnv
  /** Optional clock override for session token expiry checks. */
  nowMs?: number
}

export interface ResolvedProvider {
  adapter: ProviderAdapter
  providerId: string
  apiKey: string
  model: string
  baseUrl?: string
  source: CredentialSource
}

function optionalTrimmedString(raw: unknown, field: string, providerId?: string): string | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'string') {
    throw new ProviderError('INVALID_CONFIG', `${field} must be a string`, providerId)
  }
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeModel(raw: unknown, providerId: string): string | undefined {
  const trimmed = optionalTrimmedString(raw, 'model', providerId)
  if (!trimmed) return undefined
  if (!isValidModelId(trimmed)) {
    throw new ProviderError('INVALID_CONFIG', `Invalid model identifier for provider "${providerId}"`, providerId)
  }
  return trimmed
}

function resolveDefaultModel(adapter: ProviderAdapter, env: NodeJS.ProcessEnv): string | undefined {
  const defaultProvider = env.DEFAULT_PROVIDER?.trim() || 'anthropic'
  if (adapter.id === defaultProvider && env.DEFAULT_MODEL?.trim()) {
    return normalizeModel(env.DEFAULT_MODEL, adapter.id)
  }
  if (adapter.id === 'anthropic' && env.ANTHROPIC_MODEL?.trim()) {
    return normalizeModel(env.ANTHROPIC_MODEL, adapter.id)
  }
  return adapter.models.find((m) => m.isDefault)?.id ?? adapter.models[0]?.id
}

async function resolveCredentials(
  adapter: ProviderAdapter,
  reqCfg: RequestProviderConfig | undefined,
  matchingSession: SessionProviderCredentials | null,
  envDefaultProvider: string,
  env: NodeJS.ProcessEnv,
  loadLegacyUserApiKey?: () => Promise<string | null>,
): Promise<{ apiKey: string; baseUrl?: string; source: CredentialSource }> {
  const allowsBaseUrl = Boolean(adapter.requiresBaseUrl || adapter.supportsBaseUrl)
  const rawReqUrl = optionalTrimmedString(reqCfg?.baseUrl, 'baseUrl', adapter.id)
  const rawSessionUrl = optionalTrimmedString(matchingSession?.baseUrl, 'baseUrl', adapter.id)

  if (!allowsBaseUrl && (rawReqUrl || rawSessionUrl)) {
    throw new ProviderError('INVALID_CONFIG', `Provider "${adapter.id}" does not accept a custom baseUrl`, adapter.id)
  }

  const requestKey = reqCfg?.apiKey !== undefined ? sanitizeApiKey(reqCfg.apiKey) : ''
  const requestBaseUrl = rawReqUrl ? validateBaseUrl(rawReqUrl, { env }) : undefined
  const sessionKey = matchingSession?.apiKey !== undefined ? sanitizeApiKey(matchingSession.apiKey) : ''
  const sessionBaseUrl = rawSessionUrl ? validateBaseUrl(rawSessionUrl, { env }) : undefined
  const getEnvBaseUrl = () =>
    allowsBaseUrl && adapter.id === envDefaultProvider && env.DEFAULT_BASE_URL?.trim()
      ? validateBaseUrl(env.DEFAULT_BASE_URL, { env })
      : undefined

  // Security invariant: never forward a server/DB/mismatched-session key to a caller-supplied baseUrl.
  if (requestBaseUrl) {
    if (requestKey) return { apiKey: requestKey, baseUrl: requestBaseUrl, source: 'request' }
    if (sessionKey && sessionBaseUrl != null && sessionBaseUrl === requestBaseUrl) {
      return { apiKey: sessionKey, baseUrl: requestBaseUrl, source: 'session' }
    }
    if (adapter.apiKeyOptional) return { apiKey: '', baseUrl: requestBaseUrl, source: 'request' }
    throw new ProviderError('MISSING_API_KEY', `API key is required with custom baseUrl for "${adapter.id}"`, adapter.id)
  }

  // Never route a per-request API key to a cookie-supplied sessionBaseUrl.
  if (requestKey) return { apiKey: requestKey, baseUrl: getEnvBaseUrl(), source: 'request' }

  if (sessionBaseUrl) {
    if (sessionKey) return { apiKey: sessionKey, baseUrl: sessionBaseUrl, source: 'session' }
    if (adapter.apiKeyOptional) return { apiKey: '', baseUrl: sessionBaseUrl, source: 'session' }
    throw new ProviderError('MISSING_API_KEY', `No API key configured for provider "${adapter.id}"`, adapter.id)
  }

  if (sessionKey) return { apiKey: sessionKey, baseUrl: getEnvBaseUrl(), source: 'session' }

  const rawLegacyKey = adapter.id === 'anthropic' && loadLegacyUserApiKey ? await loadLegacyUserApiKey() : null
  const legacyKey = rawLegacyKey ? sanitizeApiKey(rawLegacyKey) : ''
  if (legacyKey) return { apiKey: legacyKey, source: 'user-db' }

  if (adapter.id === envDefaultProvider && env.DEFAULT_API_KEY?.trim()) {
    return { apiKey: sanitizeApiKey(env.DEFAULT_API_KEY), baseUrl: getEnvBaseUrl(), source: 'env-default' }
  }
  if (adapter.id === 'anthropic' && env.ANTHROPIC_API_KEY?.trim()) {
    return { apiKey: sanitizeApiKey(env.ANTHROPIC_API_KEY), source: 'env-anthropic' }
  }
  if (adapter.apiKeyOptional) return { apiKey: '', baseUrl: getEnvBaseUrl(), source: 'none' }

  throw new ProviderError('MISSING_API_KEY', `No API key configured for provider "${adapter.id}"`, adapter.id)
}

/**
 * Resolves the active `ProviderAdapter`, credentials, model, and optional baseUrl server-side.
 *
 * Credential priority:
 * 1. Explicit per-request credentials (`requestConfig`)
 * 2. Encrypted HttpOnly session cookie credentials (matching provider)
 * 3. Legacy signed-in user DB key fallback (Anthropic only, via `loadLegacyUserApiKey`)
 * 4. Server environment defaults (`DEFAULT_PROVIDER`/`DEFAULT_API_KEY`, then `ANTHROPIC_API_KEY`)
 * 5. Keyless execution when `adapter.apiKeyOptional` is true (e.g. local Ollama)
 */
export async function resolveProvider(
  options: ResolveProviderOptions = {},
): Promise<ResolvedProvider> {
  assertServerOnly('resolveProvider')

  const env = options.env ?? process.env
  const reqCfg = options.requestConfig
  const sessionCreds =
    options.sessionCredentials !== undefined
      ? options.sessionCredentials
      : options.request
        ? readSessionCredentialsFromRequest(options.request, { env, nowMs: options.nowMs })
        : null

  const envDefaultProvider = env.DEFAULT_PROVIDER?.trim() || 'anthropic'
  const reqProviderId = optionalTrimmedString(reqCfg?.providerId, 'providerId')
  const sessionProviderId = optionalTrimmedString(sessionCreds?.providerId, 'providerId')
  const providerId = reqProviderId || sessionProviderId || envDefaultProvider

  const adapter = getProvider(providerId)
  const matchingSession = sessionCreds && sessionProviderId === providerId ? sessionCreds : null

  const { apiKey, baseUrl, source } = await resolveCredentials(
    adapter,
    reqCfg,
    matchingSession,
    envDefaultProvider,
    env,
    options.loadLegacyUserApiKey,
  )

  if (adapter.requiresBaseUrl && !baseUrl) {
    throw new ProviderError('MISSING_BASE_URL', `Base URL is required for provider "${providerId}"`, providerId)
  }

  const model =
    normalizeModel(reqCfg?.model, providerId) ??
    normalizeModel(matchingSession?.model, providerId) ??
    resolveDefaultModel(adapter, env)

  if (!model) {
    throw new ProviderError('MISSING_MODEL', `No model specified for provider "${providerId}"`, providerId)
  }

  return { adapter, providerId, apiKey, model, baseUrl, source }
}
