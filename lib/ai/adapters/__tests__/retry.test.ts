import { describe, expect, it, vi } from 'vitest'
import {
  abortableSleep,
  parseRetryAfterMs,
  withRetry,
} from '@/lib/ai/adapters/retry'

describe('parseRetryAfterMs', () => {
  it('parses integer and decimal delta-seconds', () => {
    expect(parseRetryAfterMs('2')).toBe(2000)
    expect(parseRetryAfterMs('1.5')).toBe(1500)
    expect(parseRetryAfterMs('0')).toBe(0)
  })

  it('parses HTTP-date values relative to nowMs', () => {
    const nowMs = Date.parse('2026-11-27T12:00:00Z')
    expect(parseRetryAfterMs('Fri, 27 Nov 2026 12:00:05 GMT', nowMs)).toBe(5000)
    expect(parseRetryAfterMs('Fri, 27 Nov 2026 11:59:50 GMT', nowMs)).toBe(0)
  })

  it('returns undefined for missing, invalid, signed, or overflowing values', () => {
    expect(parseRetryAfterMs(undefined)).toBeUndefined()
    expect(parseRetryAfterMs('')).toBeUndefined()
    expect(parseRetryAfterMs('-5')).toBeUndefined()
    expect(parseRetryAfterMs('+5')).toBeUndefined()
    expect(parseRetryAfterMs('9'.repeat(308))).toBeUndefined()
    expect(parseRetryAfterMs('not-a-date')).toBeUndefined()
  })
})

describe('withRetry', () => {
  it('retries with bounded exponential backoff + jitter and honors Retry-After capped at maxDelayMs', async () => {
    const delays: number[] = []
    const op = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 429, retryAfterMs: 30_000 })
      .mockResolvedValueOnce('ok')

    const result = await withRetry(op, {
      maxRetries: 3,
      baseDelayMs: 200,
      maxDelayMs: 5000,
      random: () => 0.5, // jitterFactor = 0.75 => 200 * 0.75 = 150
      sleep: async (ms) => {
        delays.push(ms)
      },
      shouldRetry: (err) => {
        const e = err as { status?: number; retryAfterMs?: number }
        return { retry: e.status === 429, retryAfterMs: e.retryAfterMs }
      },
    })

    expect(result).toBe('ok')
    expect(op).toHaveBeenCalledTimes(3)
    expect(delays).toEqual([150, 5000])

    const cappedDelays: number[] = []
    const cappedOp = vi.fn<() => Promise<string>>().mockRejectedValueOnce({ status: 429 }).mockResolvedValueOnce('ok')
    await expect(
      withRetry(cappedOp, {
        maxRetries: 1,
        maxDelayMs: 100, // lower than default baseDelayMs (500)
        random: () => 1,
        sleep: async (ms) => { cappedDelays.push(ms) },
        shouldRetry: () => ({ retry: true }),
      }),
    ).resolves.toBe('ok')
    expect(cappedDelays).toEqual([100])
  })

  it('stops immediately on non-retryable errors and throws last error when retries exhaust', async () => {
    const nonRetryable = vi.fn().mockRejectedValue(new Error('fatal'))
    await expect(
      withRetry(nonRetryable, {
        maxRetries: 3,
        sleep: async () => {},
        shouldRetry: () => ({ retry: false }),
      }),
    ).rejects.toThrow('fatal')
    expect(nonRetryable).toHaveBeenCalledTimes(1)

    const exhausted = vi.fn().mockRejectedValue(new Error('still-429'))
    await expect(
      withRetry(exhausted, {
        maxRetries: 2,
        sleep: async () => {},
        shouldRetry: () => ({ retry: true }),
      }),
    ).rejects.toThrow('still-429')
    expect(exhausted).toHaveBeenCalledTimes(3)
  })

  it('aborts promptly before execution and mid-sleep via AbortSignal', async () => {
    const preAborted = new AbortController()
    preAborted.abort()
    const neverCalled = vi.fn()
    await expect(
      withRetry(neverCalled, {
        signal: preAborted.signal,
        shouldRetry: () => ({ retry: true }),
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(neverCalled).not.toHaveBeenCalled()

    const midSleep = new AbortController()
    const sleepPromise = abortableSleep(10_000, midSleep.signal)
    midSleep.abort()
    await expect(sleepPromise).rejects.toMatchObject({ name: 'AbortError' })
  })
})
