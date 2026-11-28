import { createAbortError, isAbortError, parseRetryAfterMs } from '@/lib/ai/adapters/retry'
import { ProviderError } from '@/lib/ai/adapters/types'

/**
 * Extracts a numeric HTTP status code from SDK error instances or error-like objects.
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined
  }
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' && Number.isFinite(status) ? status : undefined
}

/**
 * Extracts a structured provider error type from nested SDK error payloads
 * (for example, SSE stream `overloaded_error` or `rate_limit_error` events without HTTP status).
 */
export function getProviderErrorType(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('error' in error)) {
    return undefined
  }
  const body = (error as { error?: unknown }).error
  if (typeof body !== 'object' || body === null) return undefined
  if ('error' in body) {
    const nested = (body as { error?: unknown }).error
    if (typeof nested === 'object' && nested !== null && 'type' in nested) {
      const nestedType = (nested as { type?: unknown }).type
      if (typeof nestedType === 'string') return nestedType
    }
  }
  if ('type' in body) {
    const topType = (body as { type?: unknown }).type
    if (typeof topType === 'string') return topType
  }
  return undefined
}

/**
 * Case-insensitively reads a header value from a `Headers` instance or plain record.
 */
export function getHeaderValue(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined
  if ('get' in headers && typeof (headers as { get?: unknown }).get === 'function') {
    const value: unknown = (headers as { get: (key: string) => unknown }).get(name)
    return typeof value === 'string' ? value : undefined
  }
  const target = name.toLowerCase()
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== target) continue
    if (typeof value === 'string') return value
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  }
  return undefined
}

/**
 * Extracts a retry delay in milliseconds from `retry-after-ms` or `retry-after` error headers.
 */
export function getRetryAfterFromError(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('headers' in error)) {
    return undefined
  }
  const headers = (error as { headers?: unknown }).headers
  const rawMs = getHeaderValue(headers, 'retry-after-ms')?.trim()
  if (rawMs && /^\d+(?:\.\d+)?$/.test(rawMs)) {
    const ms = Math.round(Number(rawMs))
    if (Number.isFinite(ms) && ms >= 0) return ms
  }
  return parseRetryAfterMs(getHeaderValue(headers, 'retry-after'))
}

/**
 * Returns true if the error represents an HTTP 401/403 or provider auth error payload.
 */
export function isAuthStatusError(error: unknown): boolean {
  const status = getErrorStatus(error)
  if (status === 401 || status === 403) return true
  const type = getProviderErrorType(error)
  return type === 'authentication_error' || type === 'permission_error'
}

/**
 * Returns true if the error represents a retryable rate-limit or overload condition
 * (HTTP 429/529 or SSE `rate_limit_error` / `overloaded_error`).
 */
export function isRateLimitStatusError(error: unknown): boolean {
  const status = getErrorStatus(error)
  if (status === 429 || status === 529) return true
  const type = getProviderErrorType(error)
  return type === 'rate_limit_error' || type === 'overloaded_error'
}

/**
 * Returns true if the error is a transient pre-stream failure safe to retry
 * (rate limits, 5xx server errors, SSE `api_error`, or SDK connection/timeout errors).
 */
export function isTransientProviderError(error: unknown): boolean {
  if (isRateLimitStatusError(error)) return true
  const status = getErrorStatus(error)
  if (status !== undefined && status >= 500 && status < 600) return true
  if (getProviderErrorType(error) === 'api_error') return true
  if (error instanceof Error) {
    const names = [error.name, error.constructor?.name]
    if (names.includes('APIConnectionError') || names.includes('APIConnectionTimeoutError')) {
      return true
    }
  }
  return false
}

/**
 * Maps an upstream provider SDK error to a sanitized `ProviderError` without leaking secrets
 * or raw stack/header internals. Propagates abort errors and existing `ProviderError`s unchanged.
 */
export function mapProviderApiError(
  providerId: string,
  providerLabel: string,
  error: unknown,
  signal?: AbortSignal,
): never {
  if (signal?.aborted) {
    throw createAbortError(signal)
  }
  if (isAbortError(error)) {
    throw error
  }
  if (error instanceof ProviderError) {
    throw error
  }

  const status = getErrorStatus(error)
  const errorType = getProviderErrorType(error)
  if (isAuthStatusError(error)) {
    throw new ProviderError(
      'AUTH_FAILED',
      `${providerLabel} API authentication failed. Check your API key.`,
      providerId,
    )
  }
  if (isRateLimitStatusError(error)) {
    const overloaded = status === 529 || errorType === 'overloaded_error'
    const message = overloaded
      ? `${providerLabel} API is temporarily overloaded. Please try again shortly.`
      : `${providerLabel} API rate limit exceeded. Please try again shortly.`
    throw new ProviderError('RATE_LIMITED', message, providerId)
  }
  if (status === 404 || errorType === 'not_found_error') {
    throw new ProviderError(
      'INVALID_CONFIG',
      `Requested ${providerLabel} model was not found.`,
      providerId,
    )
  }
  if (status === 400 || status === 422 || errorType === 'invalid_request_error') {
    throw new ProviderError(
      'INVALID_CONFIG',
      `${providerLabel} API rejected the request configuration.`,
      providerId,
    )
  }

  throw new ProviderError('UPSTREAM_ERROR', `${providerLabel} API request failed.`, providerId)
}
