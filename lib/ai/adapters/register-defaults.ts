import { anthropicAdapter } from '@/lib/ai/adapters/anthropic'
import { hasProvider, registerProvider } from '@/lib/ai/adapters/registry'
import { assertServerOnly, type ProviderAdapter } from '@/lib/ai/adapters/types'

const DEFAULT_ADAPTERS: readonly ProviderAdapter[] = [anthropicAdapter]

/**
 * Ensures all built-in provider adapters are registered in the server registry.
 * Safe to invoke repeatedly in Next.js Route Handlers; preserves existing registrations.
 */
export function ensureDefaultProvidersRegistered(): void {
  assertServerOnly('ensureDefaultProvidersRegistered')
  for (const adapter of DEFAULT_ADAPTERS) {
    if (!hasProvider(adapter.id)) {
      registerProvider(adapter)
    }
  }
}
