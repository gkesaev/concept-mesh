import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearProviders, registerProvider } from '@/lib/ai/adapters/registry'
import {
  ProviderError,
  type GenerateParams,
  type GenerateResult,
  type ProviderAdapter,
} from '@/lib/ai/adapters/types'
import { resolveProvider } from '@/lib/ai/resolve-provider'

const TEST_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  ENCRYPTION_KEY: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
}

function makeAdapter(overrides: Partial<ProviderAdapter> & { id: string }): ProviderAdapter {
  return {
    name: overrides.id,
    models: [{ id: `${overrides.id}-default`, name: 'Default Model', isDefault: true }],
    validateApiKey: async () => true,
    generateVisualization: async (params: GenerateParams): Promise<GenerateResult> => ({
      html: '<!doctype html><html><body><main aria-label="test"></main></body></html>',
      tokensUsed: 100,
      model: params.model,
      duration: 50,
    }),
    ...overrides,
  }
}

describe('resolveProvider (security invariants and validation)', () => {
  beforeEach(() => {
    clearProviders()
    registerProvider(makeAdapter({ id: 'anthropic', name: 'Anthropic (Claude)' }))
    registerProvider(makeAdapter({ id: 'openai', name: 'OpenAI' }))
    registerProvider(
      makeAdapter({ id: 'custom-openai-compat', models: [], requiresBaseUrl: true, apiKeyOptional: true }),
    )
    registerProvider(
      makeAdapter({ id: 'custom-keyed-compat', models: [], requiresBaseUrl: true, apiKeyOptional: false }),
    )
  })

  afterEach(() => clearProviders())

  it('never forwards server env or DB keys to a caller-supplied baseUrl', async () => {
    const keylessResolved = await resolveProvider({
      requestConfig: {
        providerId: 'custom-openai-compat',
        baseUrl: 'https://attacker.example/v1',
        model: 'llama3.2',
      },
      env: {
        ...TEST_ENV,
        DEFAULT_PROVIDER: 'custom-openai-compat',
        DEFAULT_API_KEY: 'server-secret-key',
        DEFAULT_BASE_URL: 'https://api.groq.com/openai/v1',
      },
    })
    expect(keylessResolved.apiKey).toBe('')

    const invalidProdEnv: NodeJS.ProcessEnv = {
      ...TEST_ENV,
      NODE_ENV: 'production',
      DEFAULT_PROVIDER: 'custom-keyed-compat',
      DEFAULT_API_KEY: 'server-secret-key',
      DEFAULT_BASE_URL: 'http://localhost:11434/v1',
    }
    const explicitOverride = await resolveProvider({
      requestConfig: {
        providerId: 'custom-keyed-compat',
        apiKey: 'gsk-caller-key',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
      },
      env: invalidProdEnv,
    })
    expect(explicitOverride).toMatchObject({
      apiKey: 'gsk-caller-key',
      baseUrl: 'https://api.groq.com/openai/v1',
      source: 'request',
    })

    await expect(
      resolveProvider({ requestConfig: { providerId: 'custom-keyed-compat', model: 'llama3.2' }, env: invalidProdEnv }),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' })

    await expect(
      resolveProvider({
        requestConfig: { providerId: 'custom-keyed-compat', baseUrl: 'https://attacker.example/v1', model: 'llama3.2' },
        env: { ...TEST_ENV, DEFAULT_PROVIDER: 'custom-keyed-compat', DEFAULT_API_KEY: 'server-secret-key', DEFAULT_BASE_URL: 'https://api.groq.com/openai/v1' },
      }),
    ).rejects.toMatchObject({ code: 'MISSING_API_KEY' })
  })

  it('never routes a per-request apiKey to a cookie-supplied sessionBaseUrl', async () => {
    await expect(
      resolveProvider({
        requestConfig: {
          providerId: 'custom-openai-compat',
          apiKey: 'sk-caller-secret',
          model: 'llama3.2',
        },
        sessionCredentials: {
          providerId: 'custom-openai-compat',
          apiKey: 'sk-cookie-key',
          baseUrl: 'https://cookie-host.example/v1',
        },
        env: TEST_ENV,
      }),
    ).rejects.toMatchObject({ code: 'MISSING_BASE_URL' })
  })

  it('preserves sessionKey when requestBaseUrl matches sessionBaseUrl, but drops it on mismatch', async () => {
    const matched = await resolveProvider({
      requestConfig: {
        providerId: 'custom-openai-compat',
        baseUrl: 'https://api.groq.com/openai/v1/',
        model: 'llama-3.3-70b-versatile',
      },
      sessionCredentials: {
        providerId: 'custom-openai-compat',
        apiKey: 'gsk-session-secret',
        baseUrl: 'https://api.groq.com/openai/v1',
      },
      env: TEST_ENV,
    })
    expect(matched.apiKey).toBe('gsk-session-secret')
    expect(matched.source).toBe('session')

    const mismatched = await resolveProvider({
      requestConfig: {
        providerId: 'custom-openai-compat',
        baseUrl: 'https://other-host.example/v1',
        model: 'llama-3.3-70b-versatile',
      },
      sessionCredentials: {
        providerId: 'custom-openai-compat',
        apiKey: 'gsk-session-secret',
        baseUrl: 'https://api.groq.com/openai/v1',
      },
      env: TEST_ENV,
    })
    expect(mismatched.apiKey).toBe('')
    expect(mismatched.source).toBe('request')
  })

  it('rejects custom baseUrl for adapters that do not support baseUrl', async () => {
    await expect(
      resolveProvider({
        requestConfig: {
          providerId: 'anthropic',
          apiKey: 'sk-ant-valid',
          baseUrl: 'https://proxy.example/v1',
        },
        env: TEST_ENV,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' })

    await expect(
      resolveProvider({
        sessionCredentials: {
          providerId: 'openai',
          apiKey: 'sk-openai-valid',
          baseUrl: 'https://proxy.example/v1',
        },
        env: TEST_ENV,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
  })

  it('isolates mismatched session providerId and rejects non-string, traversal, or control-char inputs', async () => {
    await expect(
      resolveProvider({
        requestConfig: { providerId: 'openai' },
        sessionCredentials: { providerId: 'anthropic', apiKey: 'sk-ant-session' },
        loadLegacyUserApiKey: async () => 'sk-ant-db',
        env: { ...TEST_ENV, ANTHROPIC_API_KEY: 'sk-ant-env' },
      }),
    ).rejects.toMatchObject({ code: 'MISSING_API_KEY' })

    await expect(
      resolveProvider({
        requestConfig: { providerId: 'anthropic', apiKey: 'sk-ant-valid', model: 'a/../../admin' },
        env: TEST_ENV,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' })

    await expect(
      resolveProvider({
        requestConfig: { providerId: 'anthropic', apiKey: 'sk-bad\nkey' },
        env: TEST_ENV,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' })

    await expect(
      resolveProvider({
        requestConfig: { providerId: 123 as unknown as string, apiKey: 'sk-ant-valid' },
        env: TEST_ENV,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
  })

  it('blocks browser execution of resolveProvider', async () => {
    const globalRef = globalThis as Record<string, unknown>
    globalRef.window = {}
    try {
      await expect(resolveProvider({ env: TEST_ENV })).rejects.toBeInstanceOf(ProviderError)
    } finally {
      delete globalRef.window
    }
  })
})
