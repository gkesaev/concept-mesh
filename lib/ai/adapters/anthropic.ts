import Anthropic from '@anthropic-ai/sdk'
import type { Message, MessageCreateParamsNonStreaming, MessageStreamParams } from '@anthropic-ai/sdk/resources/messages/messages'
import { getRetryAfterFromError, isAuthStatusError, isTransientProviderError, mapProviderApiError } from '@/lib/ai/adapters/errors'
import { createAbortError, withRetry, type RetryOptions } from '@/lib/ai/adapters/retry'
import {
  ProviderError, assertServerOnly, isValidModelId, sanitizeApiKey,
  type GenerateParams, type GenerateResult, type ModelOption, type ProviderAdapter, type ValidateApiKeyOptions,
} from '@/lib/ai/adapters/types'
import { buildCardSystemPrompt, buildCardUserPrompt, extractHtmlFromResponse } from '@/lib/ai/prompts'

export const ANTHROPIC_PROVIDER_ID = 'anthropic'
export const DEFAULT_ANTHROPIC_MAX_TOKENS = 8192

export const ANTHROPIC_MODELS: readonly ModelOption[] = [
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    description: 'Balanced visual quality, interactivity, and speed',
    contextWindow: 200_000,
    maxOutputTokens: 16_384,
    isDefault: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    description: 'Fast, low-cost generation for quick iterations',
    contextWindow: 200_000,
    maxOutputTokens: 16_384,
  },
]

export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
const VALIDATION_FALLBACK_MODEL = 'claude-haiku-4-5-20251001'

export interface AnthropicStreamLike {
  on(event: 'text', listener: (textDelta: string) => void): unknown
  finalMessage(): Promise<Message>
}

export interface AnthropicClientLike {
  messages: {
    create(body: MessageCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<Message>
    stream(body: MessageStreamParams, options?: { signal?: AbortSignal }): AnthropicStreamLike
  }
}

export interface AnthropicAdapterOptions {
  /** Custom SDK client factory (defaults to official Anthropic API with explicit apiKey only). */
  createClient?: (apiKey: string) => AnthropicClientLike
  /** Retry configuration for transient 429/529 rate-limit responses. */
  retry?: RetryOptions
  /** Monotonic clock in milliseconds (defaults to `performance.now`). */
  now?: () => number
}

function defaultCreateClient(apiKey: string): AnthropicClientLike {
  // Explicitly null authToken and pin baseURL so ambient ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL
  // env vars can never bleed into per-user requests or bypass SSRF/custom-URL checks.
  return new Anthropic({ apiKey, authToken: null, baseURL: ANTHROPIC_BASE_URL, maxRetries: 0 })
}

function extractMessageText(message: Message): string {
  return message.content
    .filter((b): b is Extract<Message['content'][number], { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

function computeTokensUsed(message: Message): number {
  const u = message.usage
  if (!u) return 0
  return (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
}

function assertValidRequestConfig(baseUrl: unknown, modelRaw: unknown): string {
  if (baseUrl !== undefined && baseUrl !== null) {
    if (typeof baseUrl !== 'string' || baseUrl.trim().length > 0) {
      throw new ProviderError('INVALID_CONFIG', 'Provider "anthropic" does not accept a custom baseUrl', ANTHROPIC_PROVIDER_ID)
    }
  }
  const model = typeof modelRaw === 'string' ? modelRaw.trim() : ''
  if (!model || !isValidModelId(model)) {
    throw new ProviderError('INVALID_CONFIG', 'Invalid model identifier for provider "anthropic"', ANTHROPIC_PROVIDER_ID)
  }
  return model
}

/** Creates a `ProviderAdapter` backed by the official `@anthropic-ai/sdk`. */
export function createAnthropicAdapter(options: AnthropicAdapterOptions = {}): ProviderAdapter {
  const createClient = options.createClient ?? defaultCreateClient
  const now = options.now ?? (() => performance.now())
  const retryDefaults = options.retry

  return {
    id: ANTHROPIC_PROVIDER_ID,
    name: 'Anthropic (Claude)',
    models: ANTHROPIC_MODELS.map((m) => ({ ...m })),

    async validateApiKey(key: string, validateOptions?: ValidateApiKeyOptions): Promise<boolean> {
      assertServerOnly('anthropicAdapter.validateApiKey')
      const optModel = validateOptions?.model
      if (optModel !== undefined && typeof optModel !== 'string') {
        throw new ProviderError('INVALID_CONFIG', 'Invalid model identifier for provider "anthropic"', ANTHROPIC_PROVIDER_ID)
      }
      const model = assertValidRequestConfig(
        validateOptions?.baseUrl,
        optModel?.trim() || process.env.ANTHROPIC_MODEL?.trim() || VALIDATION_FALLBACK_MODEL,
      )
      if (validateOptions?.signal?.aborted) throw createAbortError(validateOptions.signal)

      let apiKey: string
      try {
        apiKey = sanitizeApiKey(key)
      } catch {
        return false
      }
      if (!apiKey) return false

      try {
        await createClient(apiKey).messages.create(
          { model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] },
          validateOptions?.signal ? { signal: validateOptions.signal } : undefined,
        )
        return true
      } catch (error) {
        if (isAuthStatusError(error)) return false
        mapProviderApiError(ANTHROPIC_PROVIDER_ID, 'Anthropic', error, validateOptions?.signal)
      }
    },

    async generateVisualization(params: GenerateParams): Promise<GenerateResult> {
      assertServerOnly('anthropicAdapter.generateVisualization')
      const model = assertValidRequestConfig(params.baseUrl, params.model)
      const apiKey = sanitizeApiKey(params.apiKey)
      if (!apiKey) throw new ProviderError('MISSING_API_KEY', 'Anthropic API key is required', ANTHROPIC_PROVIDER_ID)
      const maxTokens = params.maxTokens ?? DEFAULT_ANTHROPIC_MAX_TOKENS
      if (!Number.isInteger(maxTokens) || maxTokens < 1) {
        throw new ProviderError('INVALID_CONFIG', 'maxTokens must be a positive integer', ANTHROPIC_PROVIDER_ID)
      }
      if (params.signal?.aborted) throw createAbortError(params.signal)

      const systemPrompt = (params.systemPrompt ?? '').trim() || buildCardSystemPrompt()
      const userPrompt = buildCardUserPrompt(params.concept)
      const client = createClient(apiKey)
      const startedAt = now()
      let emittedChunks = false

      try {
        const { rawText, finalMessage } = await withRetry(
          async () => {
            emittedChunks = false
            let streamedText = ''
            const stream = client.messages.stream(
              { model, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userPrompt }] },
              params.signal ? { signal: params.signal } : undefined,
            )
            stream.on('text', (delta) => {
              if (delta.length === 0) return
              emittedChunks = true
              streamedText += delta
              params.onChunk?.(delta)
            })
            const message = await stream.finalMessage()
            return { rawText: streamedText || extractMessageText(message), finalMessage: message }
          },
          {
            ...retryDefaults,
            signal: params.signal,
            shouldRetry: (error) =>
              emittedChunks || !isTransientProviderError(error)
                ? { retry: false }
                : { retry: true, retryAfterMs: getRetryAfterFromError(error) },
          },
        )

        if (finalMessage.stop_reason === 'max_tokens') {
          throw new ProviderError('UPSTREAM_ERROR', 'Anthropic API response was truncated at the token limit.', ANTHROPIC_PROVIDER_ID)
        }

        const html = extractHtmlFromResponse(rawText)
        if (!html) {
          throw new ProviderError('UPSTREAM_ERROR', 'Anthropic API returned an empty visualization.', ANTHROPIC_PROVIDER_ID)
        }
        return {
          html,
          tokensUsed: computeTokensUsed(finalMessage),
          model: finalMessage.model || model,
          duration: Math.max(0, Math.round(now() - startedAt)),
        }
      } catch (error) {
        mapProviderApiError(ANTHROPIC_PROVIDER_ID, 'Anthropic', error, params.signal)
      }
    },
  }
}

export const anthropicAdapter: ProviderAdapter = createAnthropicAdapter()
