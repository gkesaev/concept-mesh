export interface ModelOption {
  id: string
  name: string
  description?: string
  contextWindow?: number
  maxOutputTokens?: number
  isDefault?: boolean
}

export interface ConceptInput {
  title: string
  domain: string
  description: string
}

export interface ValidateApiKeyOptions {
  /** Custom base URL for OpenAI-compatible endpoints (e.g. Ollama, Groq, Together). */
  baseUrl?: string
  /** Optional model identifier used for minimal validation requests. */
  model?: string
  /** Optional abort signal to cancel an in-flight validation request. */
  signal?: AbortSignal
}

export interface GenerateParams {
  concept: ConceptInput
  model: string
  apiKey: string
  systemPrompt: string
  maxTokens?: number
  /** Custom base URL for OpenAI-compatible endpoints. */
  baseUrl?: string
  /** Optional streaming progress callback invoked as text chunks arrive. */
  onChunk?: (chunk: string) => void
  /** Optional abort signal to cancel an in-flight generation request. */
  signal?: AbortSignal
}

export interface GenerateResult {
  html: string
  tokensUsed: number
  model: string
  duration: number
}

export interface ProviderAdapter {
  /** Stable lowercase slug identifier (e.g. "anthropic", "openai", "custom-openai-compat"). */
  readonly id: string
  /** Human-readable provider label (e.g. "Anthropic (Claude)"). */
  readonly name: string
  /** Built-in models exposed by this adapter (may be empty for user-configured endpoints). */
  readonly models: ModelOption[]
  /** True when the adapter requires a caller-supplied base URL (e.g. OpenAI-compatible). */
  readonly requiresBaseUrl?: boolean
  /** True when the adapter accepts an optional caller-supplied base URL. */
  readonly supportsBaseUrl?: boolean
  /** True when an API key is optional (e.g. local Ollama instances). */
  readonly apiKeyOptional?: boolean
  validateApiKey(key: string, options?: ValidateApiKeyOptions): Promise<boolean>
  generateVisualization(params: GenerateParams): Promise<GenerateResult>
}

/**
 * Serializable, client-safe provider metadata (never contains API keys or executable methods).
 */
export interface ProviderMetadata {
  id: string
  name: string
  models: ModelOption[]
  requiresBaseUrl: boolean
  apiKeyOptional: boolean
}

export type ProviderErrorCode =
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_ALREADY_REGISTERED'
  | 'INVALID_PROVIDER'
  | 'MISSING_API_KEY'
  | 'MISSING_MODEL'
  | 'MISSING_BASE_URL'
  | 'INVALID_CONFIG'
  | 'AUTH_FAILED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'SERVER_ONLY'

const ERROR_STATUS_MAP: Record<ProviderErrorCode, number> = {
  PROVIDER_NOT_FOUND: 404,
  PROVIDER_ALREADY_REGISTERED: 409,
  INVALID_PROVIDER: 400,
  MISSING_API_KEY: 401,
  MISSING_MODEL: 400,
  MISSING_BASE_URL: 400,
  INVALID_CONFIG: 400,
  AUTH_FAILED: 401,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  SERVER_ONLY: 500,
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly providerId?: string
  readonly statusCode: number

  constructor(code: ProviderErrorCode, message: string, providerId?: string) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.providerId = providerId
    this.statusCode = ERROR_STATUS_MAP[code]
  }
}

export const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
export const MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/

/**
 * Validates model identifiers while blocking path traversal sequences (`..`).
 */
export function isValidModelId(id: string): boolean {
  return MODEL_ID_PATTERN.test(id) && !id.includes('..')
}

/**
 * Validates and trims an API key string, rejecting ASCII control characters.
 */
export function sanitizeApiKey(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new ProviderError('INVALID_CONFIG', 'apiKey must be a string')
  }
  const trimmed = raw.trim()
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    throw new ProviderError('INVALID_CONFIG', 'apiKey must not contain control characters')
  }
  return trimmed
}

/**
 * Guards server-only AI provider operations from accidental execution in browser bundles.
 */
export function assertServerOnly(context: string): void {
  if (typeof window !== 'undefined') {
    throw new ProviderError('SERVER_ONLY', `${context} can only run on the server`)
  }
}
