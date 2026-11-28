import { APIConnectionError, APIConnectionTimeoutError, APIUserAbortError } from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import {
  getHeaderValue,
  getRetryAfterFromError,
  isAuthStatusError,
  isRateLimitStatusError,
  isTransientProviderError,
  mapProviderApiError,
} from '@/lib/ai/adapters/errors'
import { isAbortError } from '@/lib/ai/adapters/retry'
import { ProviderError } from '@/lib/ai/adapters/types'

describe('adapter error utilities', () => {
  it('detects real SDK APIUserAbortError instances and propagates them unchanged', () => {
    const sdkAbort = new APIUserAbortError()
    expect(sdkAbort.name).toBe('Error')
    expect(isAbortError(sdkAbort)).toBe(true)
    expect(() => mapProviderApiError('anthropic', 'Anthropic', sdkAbort)).toThrow(sdkAbort)
  })

  it('classifies transient pre-stream failures including 5xx, SSE api_error, and SDK connection errors', () => {
    expect(isTransientProviderError({ status: 429 })).toBe(true)
    expect(isTransientProviderError({ status: 500 })).toBe(true)
    expect(isTransientProviderError({ status: 503 })).toBe(true)
    expect(isTransientProviderError({ error: { error: { type: 'api_error' } } })).toBe(true)
    expect(isTransientProviderError(new APIConnectionError({ message: 'reset' }))).toBe(true)
    expect(isTransientProviderError(new APIConnectionTimeoutError({ message: 'timeout' }))).toBe(true)
    expect(isTransientProviderError({ status: 400 })).toBe(false)
    expect(isTransientProviderError({ status: 401 })).toBe(false)
  })

  it('reads Headers and plain-object headers case-insensitively and prefers retry-after-ms', () => {
    expect(getHeaderValue(new Headers({ 'Retry-After': '3' }), 'retry-after')).toBe('3')
    expect(getHeaderValue({ 'Retry-After': '4' }, 'retry-after')).toBe('4')
    expect(getHeaderValue({ 'RETRY-AFTER': ['5', '6'] }, 'retry-after')).toBe('5')
    expect(getHeaderValue({ get: () => 42 }, 'retry-after')).toBeUndefined()

    expect(
      getRetryAfterFromError({ headers: { 'Retry-After-Ms': '250', 'Retry-After': '5' } }),
    ).toBe(250)
    expect(getRetryAfterFromError({ headers: { 'Retry-After': '2' } })).toBe(2000)
  })

  it('maps HTTP statuses and SSE error payloads to sanitized ProviderErrors', () => {
    expect(isAuthStatusError({ error: { type: 'error', error: { type: 'authentication_error' } } })).toBe(true)
    expect(isAuthStatusError({ error: { type: 'permission_error' } })).toBe(true)
    expect(isRateLimitStatusError({ error: { type: 'error', error: { type: 'rate_limit_error' } } })).toBe(true)
    expect(isRateLimitStatusError({ error: { type: 'error', error: { type: 'overloaded_error' } } })).toBe(true)

    const cases: Array<{ err: unknown; code: ProviderError['code']; statusCode: number }> = [
      { err: { status: 400 }, code: 'INVALID_CONFIG', statusCode: 400 },
      { err: { status: 422 }, code: 'INVALID_CONFIG', statusCode: 400 },
      { err: { status: 404 }, code: 'INVALID_CONFIG', statusCode: 400 },
      { err: { error: { error: { type: 'invalid_request_error' } } }, code: 'INVALID_CONFIG', statusCode: 400 },
      { err: { error: { error: { type: 'not_found_error' } } }, code: 'INVALID_CONFIG', statusCode: 400 },
      { err: { error: { error: { type: 'authentication_error' } } }, code: 'AUTH_FAILED', statusCode: 401 },
      { err: { error: { error: { type: 'rate_limit_error' } } }, code: 'RATE_LIMITED', statusCode: 429 },
      { err: { status: 529 }, code: 'RATE_LIMITED', statusCode: 429 },
      { err: new Error('ECONNRESET sk-ant-secret'), code: 'UPSTREAM_ERROR', statusCode: 502 },
    ]

    for (const { err, code, statusCode } of cases) {
      let caught: unknown
      try {
        mapProviderApiError('anthropic', 'Anthropic', err)
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(ProviderError)
      const providerErr = caught as ProviderError
      expect(providerErr.code).toBe(code)
      expect(providerErr.statusCode).toBe(statusCode)
      expect(providerErr.providerId).toBe('anthropic')
      expect(providerErr.message).not.toContain('sk-ant-secret')
    }
  })
})
