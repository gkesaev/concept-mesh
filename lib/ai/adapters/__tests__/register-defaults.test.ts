import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { anthropicAdapter } from '@/lib/ai/adapters/anthropic'
import { ensureDefaultProvidersRegistered } from '@/lib/ai/adapters/register-defaults'
import { clearProviders, getProvider, hasProvider, registerProvider } from '@/lib/ai/adapters/registry'
import { ProviderError, type ProviderAdapter } from '@/lib/ai/adapters/types'
import { resolveProvider } from '@/lib/ai/resolve-provider'

describe('ensureDefaultProvidersRegistered and resolveProvider integration', () => {
  beforeEach(() => clearProviders())
  afterEach(() => clearProviders())

  it('registers the Anthropic adapter idempotently and resolves via resolveProvider', async () => {
    expect(hasProvider('anthropic')).toBe(false)

    ensureDefaultProvidersRegistered()
    ensureDefaultProvidersRegistered()
    expect(hasProvider('anthropic')).toBe(true)
    expect(getProvider('anthropic')).toBe(anthropicAdapter)

    const resolved = await resolveProvider({
      env: { NODE_ENV: 'test', ANTHROPIC_API_KEY: 'sk-ant-env-key' },
    })
    expect(resolved.adapter).toBe(anthropicAdapter)
    expect(resolved.providerId).toBe('anthropic')
    expect(resolved.model).toBe('claude-sonnet-4-20250514')
    expect(resolved.source).toBe('env-anthropic')

    const withEnvModel = await resolveProvider({
      env: {
        NODE_ENV: 'test',
        ANTHROPIC_API_KEY: 'sk-ant-env-key',
        ANTHROPIC_MODEL: 'claude-haiku-4-5-20251001',
      },
    })
    expect(withEnvModel.model).toBe('claude-haiku-4-5-20251001')
  })

  it('preserves an existing custom registration and blocks browser execution', () => {
    const custom: ProviderAdapter = { ...anthropicAdapter, name: 'Custom Override' }
    registerProvider(custom)
    ensureDefaultProvidersRegistered()
    expect(getProvider('anthropic').name).toBe('Custom Override')

    const globalRef = globalThis as Record<string, unknown>
    globalRef.window = {}
    try {
      expect(() => ensureDefaultProvidersRegistered()).toThrowError(ProviderError)
    } finally {
      delete globalRef.window
    }
  })
})
