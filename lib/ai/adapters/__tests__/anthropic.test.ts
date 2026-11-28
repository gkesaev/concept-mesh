import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@anthropic-ai/sdk/resources/messages/messages'

const mockCreate = vi.fn()
const mockStream = vi.fn()
const mockConstructor = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: (...args: unknown[]) => mockCreate(...args),
      stream: (...args: unknown[]) => mockStream(...args),
    }

    constructor(opts: unknown) {
      mockConstructor(opts)
    }
  }
  return { default: MockAnthropic }
})

import {
  ANTHROPIC_BASE_URL,
  ANTHROPIC_MODELS,
  ANTHROPIC_PROVIDER_ID,
  anthropicAdapter,
  createAnthropicAdapter,
} from '@/lib/ai/adapters/anthropic'
import { ProviderError } from '@/lib/ai/adapters/types'

const SAMPLE_HTML =
  '<!doctype html><html lang="en"><head><title>Entropy</title></head><body><main aria-label="Entropy"></main></body></html>'

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg_123',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-20250514',
    container: null,
    content: [{ type: 'text', text: SAMPLE_HTML, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 400,
      output_tokens: 600,
      cache_creation_input_tokens: 50,
      cache_read_input_tokens: 25,
      cache_creation: null,
      inference_geo: null,
      server_tool_use: null,
      service_tier: null,
    },
    ...overrides,
  }
}

function makeFakeStream(chunks: string[], message: Message = makeMessage(), failAfterChunks?: unknown) {
  let listener: ((delta: string) => void) | undefined
  return {
    on(event: 'text', cb: (delta: string) => void) {
      if (event === 'text') listener = cb
    },
    async finalMessage(): Promise<Message> {
      for (const chunk of chunks) listener?.(chunk)
      if (failAfterChunks !== undefined) throw failAfterChunks
      return message
    },
  }
}

describe('anthropicAdapter', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllEnvs())

  it('exposes ProviderAdapter metadata with required Claude models', () => {
    expect(anthropicAdapter.id).toBe(ANTHROPIC_PROVIDER_ID)
    expect(anthropicAdapter.name).toBe('Anthropic (Claude)')
    expect(ANTHROPIC_MODELS.map((m) => m.id)).toEqual([
      'claude-sonnet-4-20250514',
      'claude-haiku-4-5-20251001',
    ])
    expect(ANTHROPIC_MODELS.find((m) => m.isDefault)?.id).toBe('claude-sonnet-4-20250514')
  })

  it('validateApiKey pins client options, makes 1-token ping, and handles auth/rate-limit/abort cleanly', async () => {
    mockCreate.mockResolvedValueOnce(makeMessage())
    await expect(anthropicAdapter.validateApiKey('sk-ant-secret-key')).resolves.toBe(true)
    expect(mockConstructor).toHaveBeenCalledWith({
      apiKey: 'sk-ant-secret-key',
      authToken: null,
      baseURL: ANTHROPIC_BASE_URL,
      maxRetries: 0,
    })
    expect(mockCreate).toHaveBeenCalledWith(
      { model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] },
      undefined,
    )

    mockCreate.mockRejectedValueOnce({ status: 401 })
    await expect(anthropicAdapter.validateApiKey('sk-ant-bad')).resolves.toBe(false)
    mockCreate.mockRejectedValueOnce({ status: 403 })
    await expect(anthropicAdapter.validateApiKey('sk-ant-forbidden')).resolves.toBe(false)

    expect(await anthropicAdapter.validateApiKey('   ')).toBe(false)
    expect(await anthropicAdapter.validateApiKey('sk-ant-bad\nkey')).toBe(false)
    expect(mockCreate).toHaveBeenCalledTimes(3)

    mockCreate.mockRejectedValueOnce({ status: 429, message: 'rate limit for sk-ant-secret-key' })
    await expect(anthropicAdapter.validateApiKey('sk-ant-secret-key')).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ProviderError && err.code === 'RATE_LIMITED' && !err.message.includes('sk-ant-secret-key'),
    )

    const controller = new AbortController()
    controller.abort()
    await expect(
      anthropicAdapter.validateApiKey('sk-ant-secret-key', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('streams chunks, strips markdown fences, falls back to card spec prompt, and tracks tokens & duration', async () => {
    const ticks = [1000, 1425]
    const adapter = createAnthropicAdapter({ now: () => ticks.shift() ?? 1425 })
    const received: string[] = []
    mockStream.mockReturnValueOnce(
      makeFakeStream(['```html\n', SAMPLE_HTML.slice(0, 40), SAMPLE_HTML.slice(40), '\n```']),
    )

    const result = await adapter.generateVisualization({
      concept: { title: 'Entropy', domain: 'physics', description: 'Measure of disorder' },
      model: 'claude-sonnet-4-20250514',
      apiKey: 'sk-ant-valid',
      systemPrompt: '   ',
      onChunk: (chunk) => received.push(chunk),
    })

    expect(received.join('')).toContain('<!doctype html>')
    expect(result).toEqual({
      html: SAMPLE_HTML,
      tokensUsed: 1075,
      model: 'claude-sonnet-4-20250514',
      duration: 425,
    })
    const [callBody] = mockStream.mock.calls[0] as [{ system: string; messages: Array<{ content: string }> }]
    expect(callBody.system).toContain('docs/card-spec.md')
    expect(callBody.messages[0]?.content).toContain('<concept_data>')
  })

  it('retries 429/overloaded with backoff & Retry-After, stops on exhaustion, and never retries mid-stream', async () => {
    const sleeps: number[] = []
    const adapter = createAnthropicAdapter({
      retry: { maxRetries: 2, baseDelayMs: 100, maxDelayMs: 2000, random: () => 0, sleep: async (ms) => { sleeps.push(ms) } },
    })
    const params = {
      concept: { title: 'Entropy', domain: 'physics', description: 'Disorder' },
      model: 'claude-sonnet-4-20250514',
      apiKey: 'sk-ant-valid',
      systemPrompt: 'Custom prompt',
    }

    mockStream
      .mockReturnValueOnce(makeFakeStream([], makeMessage(), { status: 429, headers: new Headers({ 'retry-after': '1' }) }))
      .mockReturnValueOnce(makeFakeStream([], makeMessage(), { status: 500 }))
      .mockReturnValueOnce(makeFakeStream([SAMPLE_HTML]))

    expect((await adapter.generateVisualization(params)).html).toBe(SAMPLE_HTML)
    expect(sleeps).toEqual([1000, 100])

    mockStream.mockReturnValue(makeFakeStream([], makeMessage(), { status: 429 }))
    await expect(adapter.generateVisualization(params)).rejects.toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 })

    mockStream.mockReset()
    mockStream.mockReturnValueOnce(makeFakeStream(['<!doctype '], makeMessage(), { status: 529 }))
    await expect(adapter.generateVisualization(params)).rejects.toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 })
    expect(mockStream).toHaveBeenCalledTimes(1)
  })

  it('rejects custom baseUrl, invalid config, truncated/empty output, and browser execution', async () => {
    const params = {
      concept: { title: 'Entropy', domain: 'physics', description: 'Disorder' },
      model: 'claude-sonnet-4-20250514',
      apiKey: 'sk-ant-valid',
      systemPrompt: 'Prompt',
    }

    await expect(anthropicAdapter.generateVisualization({ ...params, baseUrl: 'https://proxy.example/v1' })).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
    await expect(anthropicAdapter.validateApiKey('sk-ant-valid', { model: 123 as unknown as string })).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
    mockStream.mockReturnValueOnce(makeFakeStream(['<!doctype html><html>'], makeMessage({ stop_reason: 'max_tokens' })))
    await expect(anthropicAdapter.generateVisualization(params)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR', statusCode: 502 })
    mockStream.mockReturnValueOnce(makeFakeStream(['   '], makeMessage({ content: [] })))
    await expect(anthropicAdapter.generateVisualization(params)).rejects.toMatchObject({ code: 'UPSTREAM_ERROR', statusCode: 502 })

    const globalRef = globalThis as Record<string, unknown>
    globalRef.window = {}
    try {
      await expect(anthropicAdapter.validateApiKey('sk-ant-valid')).rejects.toMatchObject({ code: 'SERVER_ONLY' })
      await expect(anthropicAdapter.generateVisualization(params)).rejects.toMatchObject({ code: 'SERVER_ONLY' })
    } finally {
      delete globalRef.window
    }
  })
})
