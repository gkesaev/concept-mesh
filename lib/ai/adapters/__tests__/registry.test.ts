import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearProviders,
  getProvider,
  hasProvider,
  listProviderMetadata,
  listProviders,
  registerProvider,
  unregisterProvider,
} from '@/lib/ai/adapters/registry'
import {
  ProviderError,
  type GenerateParams,
  type GenerateResult,
  type ModelOption,
  type ProviderAdapter,
} from '@/lib/ai/adapters/types'

function createMockAdapter(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  return {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', isDefault: true },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    ],
    validateApiKey: async (key: string) => key.startsWith('sk-ant-'),
    generateVisualization: async (params: GenerateParams): Promise<GenerateResult> => ({
      html: `<!doctype html><html><body><main aria-label="${params.concept.title}"></main></body></html>`,
      tokensUsed: 1234,
      model: params.model,
      duration: 420,
    }),
    ...overrides,
  }
}

describe('provider adapter registry', () => {
  beforeEach(() => clearProviders())
  afterEach(() => clearProviders())

  it('registers and retrieves an adapter by id', async () => {
    const adapter = createMockAdapter()
    registerProvider(adapter)

    expect(hasProvider('anthropic')).toBe(true)
    expect(hasProvider('openai')).toBe(false)

    const retrieved = getProvider('anthropic')
    expect(retrieved).toBe(adapter)
    expect(await retrieved.validateApiKey('sk-ant-valid')).toBe(true)
    expect(await retrieved.validateApiKey('invalid')).toBe(false)

    const result = await retrieved.generateVisualization({
      concept: { title: 'Entropy', domain: 'physics', description: 'Measure of disorder' },
      model: 'claude-sonnet-4-20250514',
      apiKey: 'sk-ant-valid',
      systemPrompt: 'Generate an HTML visualization.',
    })
    expect(result.html).toContain('Entropy')
    expect(result.tokensUsed).toBe(1234)
    expect(result.model).toBe('claude-sonnet-4-20250514')
    expect(result.duration).toBe(420)
  })

  it('throws PROVIDER_NOT_FOUND for unknown slug and INVALID_PROVIDER for malformed id', () => {
    expect(() => getProvider('missing')).toThrowError(ProviderError)
    try {
      getProvider('missing')
    } catch (err) {
      const providerErr = err as ProviderError
      expect(providerErr.code).toBe('PROVIDER_NOT_FOUND')
      expect(providerErr.statusCode).toBe(404)
      expect(providerErr.providerId).toBe('missing')
    }

    try {
      getProvider('BAD ID\n<script>')
    } catch (err) {
      const providerErr = err as ProviderError
      expect(providerErr.code).toBe('INVALID_PROVIDER')
      expect(providerErr.message).not.toContain('<script>')
    }
  })

  it('rejects duplicate registrations unless replace is true', () => {
    registerProvider(createMockAdapter({ id: 'openai', name: 'OpenAI v1' }))
    expect(() =>
      registerProvider(createMockAdapter({ id: 'openai', name: 'OpenAI v2' })),
    ).toThrowError(ProviderError)

    registerProvider(createMockAdapter({ id: 'openai', name: 'OpenAI v2' }), { replace: true })
    expect(getProvider('openai').name).toBe('OpenAI v2')
  })

  it('rejects malformed adapters, missing methods, non-array models, and traversal model ids', () => {
    expect(() => registerProvider(null as unknown as ProviderAdapter)).toThrowError(ProviderError)
    expect(() => registerProvider(createMockAdapter({ id: 'Bad_ID!' }))).toThrowError(ProviderError)
    expect(() => registerProvider(createMockAdapter({ name: '   ' }))).toThrowError(ProviderError)
    expect(() =>
      registerProvider(createMockAdapter({ models: 'invalid' as unknown as ModelOption[] })),
    ).toThrowError(ProviderError)
    expect(() =>
      registerProvider(
        createMockAdapter({
          validateApiKey: undefined as unknown as ProviderAdapter['validateApiKey'],
        }),
      ),
    ).toThrowError(ProviderError)
    expect(() =>
      registerProvider(
        createMockAdapter({
          generateVisualization: undefined as unknown as ProviderAdapter['generateVisualization'],
        }),
      ),
    ).toThrowError(ProviderError)
    expect(() =>
      registerProvider(
        createMockAdapter({ models: [{ id: 'a/../../admin', name: 'Bad Model' }] }),
      ),
    ).toThrowError(ProviderError)
    expect(() =>
      registerProvider(
        createMockAdapter({
          models: [
            { id: 'dup', name: 'Model A' },
            { id: 'dup', name: 'Model B' },
          ],
        }),
      ),
    ).toThrowError(ProviderError)
  })

  it('lists adapters and strips extra properties in client-safe metadata copies', () => {
    const modelWithExtra = Object.assign(
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', isDefault: true },
      { internalSecret: 'do-not-expose' },
    )
    registerProvider(createMockAdapter({ id: 'anthropic', models: [modelWithExtra] }))
    registerProvider(
      createMockAdapter({
        id: 'custom-openai-compat',
        name: 'Custom OpenAI-Compatible',
        models: [],
        requiresBaseUrl: true,
        apiKeyOptional: true,
      }),
    )

    expect(listProviders().map((p) => p.id)).toEqual(['anthropic', 'custom-openai-compat'])

    const metadata = listProviderMetadata()
    expect(metadata[0].models[0]).toEqual({
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      isDefault: true,
    })
    expect('internalSecret' in metadata[0].models[0]).toBe(false)

    metadata[0].models[0].name = 'Mutated'
    expect(getProvider('anthropic').models[0].name).toBe('Claude Sonnet 4')
  })

  it('unregisters a provider cleanly and blocks browser execution across all registry functions', () => {
    registerProvider(createMockAdapter({ id: 'anthropic' }))
    expect(unregisterProvider('anthropic')).toBe(true)
    expect(unregisterProvider('anthropic')).toBe(false)
    expect(hasProvider('anthropic')).toBe(false)

    const globalRef = globalThis as Record<string, unknown>
    globalRef.window = {}
    try {
      expect(() => registerProvider(createMockAdapter())).toThrowError(ProviderError)
      expect(() => getProvider('anthropic')).toThrowError(ProviderError)
      expect(() => hasProvider('anthropic')).toThrowError(ProviderError)
      expect(() => listProviders()).toThrowError(ProviderError)
      expect(() => listProviderMetadata()).toThrowError(ProviderError)
      expect(() => unregisterProvider('anthropic')).toThrowError(ProviderError)
      expect(() => clearProviders()).toThrowError(ProviderError)
    } finally {
      delete globalRef.window
    }
  })
})
