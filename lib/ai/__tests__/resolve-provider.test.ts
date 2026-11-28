import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearProviders, registerProvider } from '@/lib/ai/adapters/registry'
import type { GenerateParams, GenerateResult, ProviderAdapter } from '@/lib/ai/adapters/types'
import { resolveProvider } from '@/lib/ai/resolve-provider'
import { buildProviderSessionCookie } from '@/lib/ai/session-cookie'

const TEST_SECRET_ENV: NodeJS.ProcessEnv = {
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

describe('resolveProvider (resolution priority and fallbacks)', () => {
  beforeEach(() => {
    clearProviders()
    registerProvider(
      makeAdapter({
        id: 'anthropic',
        name: 'Anthropic (Claude)',
        models: [
          { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', isDefault: true },
          { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
        ],
      }),
    )
    registerProvider(
      makeAdapter({
        id: 'openai',
        name: 'OpenAI',
        models: [
          { id: 'gpt-4o', name: 'GPT-4o', isDefault: true },
          { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
        ],
      }),
    )
    registerProvider(
      makeAdapter({
        id: 'custom-openai-compat',
        name: 'Custom OpenAI-Compatible',
        models: [],
        requiresBaseUrl: true,
        apiKeyOptional: true,
      }),
    )
  })

  afterEach(() => clearProviders())

  it('prioritizes per-request credentials over session, DB, and env keys', async () => {
    const resolved = await resolveProvider({
      requestConfig: { providerId: 'openai', apiKey: 'sk-request-key', model: 'gpt-4o-mini' },
      sessionCredentials: { providerId: 'openai', apiKey: 'sk-session-key', model: 'gpt-4o' },
      loadLegacyUserApiKey: async () => 'sk-ant-db-key',
      env: { ...TEST_SECRET_ENV, DEFAULT_PROVIDER: 'openai', DEFAULT_API_KEY: 'sk-env-key' },
    })

    expect(resolved.providerId).toBe('openai')
    expect(resolved.apiKey).toBe('sk-request-key')
    expect(resolved.model).toBe('gpt-4o-mini')
    expect(resolved.source).toBe('request')
  })

  it('decrypts credentials from an HttpOnly session cookie and trims padded providerId', async () => {
    const nowMs = 1_700_000_000_000
    const setCookie = buildProviderSessionCookie(
      { providerId: 'openai', apiKey: 'sk-cookie-secret', model: 'gpt-4o-mini' },
      { env: TEST_SECRET_ENV, nowMs },
    )
    const request = new Request('http://localhost:3000/api/cards/generate', {
      headers: { cookie: setCookie.split(';')[0] },
    })

    const resolved = await resolveProvider({ request, env: TEST_SECRET_ENV, nowMs: nowMs + 5000 })
    expect(resolved.providerId).toBe('openai')
    expect(resolved.apiKey).toBe('sk-cookie-secret')
    expect(resolved.model).toBe('gpt-4o-mini')
    expect(resolved.source).toBe('session')

    // Explicit padded sessionCredentials.providerId matches cleanly
    const padded = await resolveProvider({
      sessionCredentials: { providerId: ' openai ', apiKey: 'sk-padded-key' },
      env: TEST_SECRET_ENV,
    })
    expect(padded.providerId).toBe('openai')
    expect(padded.apiKey).toBe('sk-padded-key')
    expect(padded.source).toBe('session')

    // Explicit sessionCredentials: null overrides a valid cookie on request
    const overridden = await resolveProvider({
      request,
      sessionCredentials: null,
      env: { ...TEST_SECRET_ENV, ANTHROPIC_API_KEY: 'sk-ant-env-fallback' },
      nowMs: nowMs + 5000,
    })
    expect(overridden.providerId).toBe('anthropic')
    expect(overridden.source).toBe('env-anthropic')
  })

  it('falls back cleanly to env when a session cookie is expired or corrupt', async () => {
    const startMs = 1_700_000_000_000
    const expiredCookie = buildProviderSessionCookie(
      { providerId: 'openai', apiKey: 'sk-expired' },
      { env: TEST_SECRET_ENV, nowMs: startMs, ttlSeconds: 60 },
    )
    const request = new Request('http://localhost:3000/api/cards/generate', {
      headers: { cookie: expiredCookie.split(';')[0] },
    })

    const resolved = await resolveProvider({
      request,
      env: { ...TEST_SECRET_ENV, ANTHROPIC_API_KEY: 'sk-ant-fallback' },
      nowMs: startMs + 120_000,
    })
    expect(resolved.providerId).toBe('anthropic')
    expect(resolved.apiKey).toBe('sk-ant-fallback')
    expect(resolved.source).toBe('env-anthropic')
  })

  it('falls back to legacy DB key only for anthropic, then DEFAULT_* and ANTHROPIC_* env vars', async () => {
    const dbResolved = await resolveProvider({
      loadLegacyUserApiKey: async () => 'sk-ant-legacy-db',
      env: { ...TEST_SECRET_ENV, ANTHROPIC_API_KEY: 'sk-ant-env' },
    })
    expect(dbResolved.apiKey).toBe('sk-ant-legacy-db')
    expect(dbResolved.source).toBe('user-db')

    const customDefaultEnv = await resolveProvider({
      env: {
        ...TEST_SECRET_ENV,
        DEFAULT_PROVIDER: 'custom-openai-compat',
        DEFAULT_API_KEY: 'gsk-groq-secret',
        DEFAULT_BASE_URL: 'https://api.groq.com/openai/v1',
        DEFAULT_MODEL: 'llama-3.3-70b-versatile',
      },
    })
    expect(customDefaultEnv.providerId).toBe('custom-openai-compat')
    expect(customDefaultEnv.apiKey).toBe('gsk-groq-secret')
    expect(customDefaultEnv.baseUrl).toBe('https://api.groq.com/openai/v1')
    expect(customDefaultEnv.model).toBe('llama-3.3-70b-versatile')
    expect(customDefaultEnv.source).toBe('env-default')

    const legacyEnv = await resolveProvider({
      env: {
        ...TEST_SECRET_ENV,
        ANTHROPIC_API_KEY: 'sk-ant-server',
        ANTHROPIC_MODEL: 'claude-haiku-4-5-20251001',
      },
    })
    expect(legacyEnv.model).toBe('claude-haiku-4-5-20251001')
    expect(legacyEnv.source).toBe('env-anthropic')
  })

  it('supports keyless local OpenAI-compatible endpoints and enforces baseUrl and model', async () => {
    const localResolved = await resolveProvider({
      requestConfig: {
        providerId: 'custom-openai-compat',
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3.2:latest',
      },
      env: TEST_SECRET_ENV,
    })
    expect(localResolved.apiKey).toBe('')
    expect(localResolved.baseUrl).toBe('http://localhost:11434/v1')
    expect(localResolved.model).toBe('llama3.2:latest')
    expect(localResolved.source).toBe('request')

    await expect(
      resolveProvider({
        requestConfig: { providerId: 'custom-openai-compat', model: 'llama3.2' },
        env: TEST_SECRET_ENV,
      }),
    ).rejects.toMatchObject({ code: 'MISSING_BASE_URL' })

    await expect(
      resolveProvider({
        requestConfig: { providerId: 'custom-openai-compat', baseUrl: 'http://localhost:11434/v1' },
        env: TEST_SECRET_ENV,
      }),
    ).rejects.toMatchObject({ code: 'MISSING_MODEL' })
  })
})
