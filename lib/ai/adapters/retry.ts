export interface RetryDecision {
  retry: boolean
  /** Optional server-suggested delay in milliseconds (e.g. from Retry-After header). */
  retryAfterMs?: number
}

export interface RetryOptions {
  /** Maximum number of retry attempts after the initial try (default: 3). */
  maxRetries?: number
  /** Base exponential backoff delay in milliseconds (default: 500). */
  baseDelayMs?: number
  /** Upper bound for any single backoff sleep in milliseconds (default: 15_000). */
  maxDelayMs?: number
  /** Optional AbortSignal to cancel retries promptly. */
  signal?: AbortSignal
  /** Injectable sleep implementation for deterministic tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Injectable PRNG returning [0, 1) for deterministic jitter tests. */
  random?: () => number
}

export interface WithRetryOptions extends RetryOptions {
  shouldRetry: (error: unknown, attempt: number) => RetryDecision
}

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BASE_DELAY_MS = 500
const DEFAULT_MAX_DELAY_MS = 15_000

/**
 * Creates a standardized AbortError, preserving `signal.reason` when it is already an Error.
 */
export function createAbortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) {
    return signal.reason
  }
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}

/**
 * Returns true if the error represents an abort / cancellation signal
 * (including Stainless SDK `APIUserAbortError` instances whose `.name` remains `'Error'`).
 */
export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'AbortError' ||
    error.name === 'APIUserAbortError' ||
    error.constructor?.name === 'APIUserAbortError'
  )
}

/**
 * Parses an HTTP `Retry-After` header value (delta-seconds or HTTP-date) into milliseconds.
 * Returns `undefined` when missing, unparseable, negative, or overflowing.
 */
export function parseRetryAfterMs(
  headerValue: string | null | undefined,
  nowMs: number = Date.now(),
): number | undefined {
  if (!headerValue) return undefined
  const trimmed = headerValue.trim()
  if (!trimmed) return undefined

  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    if (trimmed.startsWith('-') || trimmed.startsWith('+')) return undefined
    const ms = Math.round(Number(trimmed) * 1000)
    return Number.isFinite(ms) && ms >= 0 ? ms : undefined
  }

  const targetMs = Date.parse(trimmed)
  if (!Number.isFinite(targetMs)) return undefined
  return Math.max(0, targetMs - nowMs)
}

/**
 * Sleeps for `ms` milliseconds while respecting an optional `AbortSignal` without leaking listeners.
 */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError(signal))
  }
  if (ms <= 0) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(createAbortError(signal))
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function computeBackoffDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number,
  retryAfterMs?: number,
): number {
  if (retryAfterMs != null && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(maxDelayMs, Math.round(retryAfterMs))
  }
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt)
  const jitterFactor = 0.5 + Math.min(1, Math.max(0, random())) * 0.5
  return Math.round(exponential * jitterFactor)
}

/**
 * Executes an async operation with bounded exponential backoff, jitter, `Retry-After`, and `AbortSignal`.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: WithRetryOptions,
): Promise<T> {
  const maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES)
  const maxDelayMs = Math.max(1, options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS)
  const baseDelayMs = Math.min(maxDelayMs, Math.max(1, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS))
  const sleep = options.sleep ?? abortableSleep
  const random = options.random ?? Math.random
  const { signal, shouldRetry } = options

  for (let attempt = 0; ; attempt += 1) {
    if (signal?.aborted) {
      throw createAbortError(signal)
    }

    try {
      return await operation(attempt)
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        throw signal?.aborted ? createAbortError(signal) : error
      }

      const decision = shouldRetry(error, attempt)
      if (!decision.retry || attempt >= maxRetries) {
        throw error
      }

      const delayMs = computeBackoffDelayMs(
        attempt,
        baseDelayMs,
        maxDelayMs,
        random,
        decision.retryAfterMs,
      )
      await sleep(delayMs, signal)
    }
  }
}
