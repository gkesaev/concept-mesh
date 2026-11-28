import {
  PROVIDER_ID_PATTERN,
  ProviderError,
  assertServerOnly,
  isValidModelId,
  type ModelOption,
  type ProviderAdapter,
  type ProviderMetadata,
} from '@/lib/ai/adapters/types'

const REGISTRY_SYMBOL = Symbol.for('concept-mesh.provider-registry')

interface GlobalRegistryContainer {
  [REGISTRY_SYMBOL]?: Map<string, ProviderAdapter>
}

export interface RegisterProviderOptions {
  /** Allow replacing an already-registered adapter with the same ID. */
  replace?: boolean
}

function getRegistryMap(): Map<string, ProviderAdapter> {
  const container = globalThis as unknown as GlobalRegistryContainer
  let map = container[REGISTRY_SYMBOL]
  if (!map) {
    map = new Map<string, ProviderAdapter>()
    container[REGISTRY_SYMBOL] = map
  }
  return map
}

function copyModelOption(model: ModelOption): ModelOption {
  const copy: ModelOption = { id: model.id, name: model.name }
  if (model.description !== undefined) copy.description = model.description
  if (model.contextWindow !== undefined) copy.contextWindow = model.contextWindow
  if (model.maxOutputTokens !== undefined) copy.maxOutputTokens = model.maxOutputTokens
  if (model.isDefault !== undefined) copy.isDefault = model.isDefault
  return copy
}

function validateAdapter(adapter: ProviderAdapter): void {
  if (!adapter || typeof adapter !== 'object') {
    throw new ProviderError('INVALID_PROVIDER', 'Provider adapter must be an object')
  }
  if (typeof adapter.id !== 'string' || !PROVIDER_ID_PATTERN.test(adapter.id)) {
    throw new ProviderError(
      'INVALID_PROVIDER',
      'Provider id must be 1-64 lowercase alphanumeric or hyphen characters',
    )
  }
  if (typeof adapter.name !== 'string' || adapter.name.trim().length === 0) {
    throw new ProviderError(
      'INVALID_PROVIDER',
      `Provider "${adapter.id}" must have a non-empty name`,
      adapter.id,
    )
  }
  if (!Array.isArray(adapter.models)) {
    throw new ProviderError(
      'INVALID_PROVIDER',
      `Provider "${adapter.id}" must define a models array`,
      adapter.id,
    )
  }

  const seenModels = new Set<string>()
  for (const model of adapter.models) {
    if (
      !model ||
      typeof model.id !== 'string' ||
      !isValidModelId(model.id) ||
      typeof model.name !== 'string' ||
      model.name.trim().length === 0
    ) {
      throw new ProviderError(
        'INVALID_PROVIDER',
        `Provider "${adapter.id}" contains an invalid model option`,
        adapter.id,
      )
    }
    if (seenModels.has(model.id)) {
      throw new ProviderError(
        'INVALID_PROVIDER',
        `Provider "${adapter.id}" contains duplicate model id "${model.id}"`,
        adapter.id,
      )
    }
    seenModels.add(model.id)
  }

  if (typeof adapter.validateApiKey !== 'function') {
    throw new ProviderError(
      'INVALID_PROVIDER',
      `Provider "${adapter.id}" must implement validateApiKey()`,
      adapter.id,
    )
  }
  if (typeof adapter.generateVisualization !== 'function') {
    throw new ProviderError(
      'INVALID_PROVIDER',
      `Provider "${adapter.id}" must implement generateVisualization()`,
      adapter.id,
    )
  }
}

/**
 * Registers a provider adapter by its unique `id`.
 * Throws `ProviderError('PROVIDER_ALREADY_REGISTERED')` on duplicate IDs unless `replace: true`.
 */
export function registerProvider(
  adapter: ProviderAdapter,
  options?: RegisterProviderOptions,
): void {
  assertServerOnly('registerProvider')
  validateAdapter(adapter)

  const registry = getRegistryMap()
  if (registry.has(adapter.id) && !options?.replace) {
    throw new ProviderError(
      'PROVIDER_ALREADY_REGISTERED',
      `Provider "${adapter.id}" is already registered`,
      adapter.id,
    )
  }

  registry.set(adapter.id, adapter)
}

/**
 * Looks up a registered provider adapter by `id`.
 * Throws `ProviderError('INVALID_PROVIDER')` for malformed IDs or `PROVIDER_NOT_FOUND` when unregistered.
 */
export function getProvider(id: string): ProviderAdapter {
  assertServerOnly('getProvider')

  const normalizedId = typeof id === 'string' ? id.trim() : ''
  if (!normalizedId || !PROVIDER_ID_PATTERN.test(normalizedId)) {
    throw new ProviderError('INVALID_PROVIDER', 'Invalid provider id')
  }

  const adapter = getRegistryMap().get(normalizedId)
  if (!adapter) {
    throw new ProviderError(
      'PROVIDER_NOT_FOUND',
      `Provider "${normalizedId}" is not registered`,
      normalizedId,
    )
  }

  return adapter
}

/**
 * Returns true if an adapter with the given `id` is currently registered.
 */
export function hasProvider(id: string): boolean {
  assertServerOnly('hasProvider')
  return typeof id === 'string' && getRegistryMap().has(id.trim())
}

/**
 * Returns all registered provider adapters.
 */
export function listProviders(): ProviderAdapter[] {
  assertServerOnly('listProviders')
  return Array.from(getRegistryMap().values())
}

/**
 * Returns client-safe, defensive copies of metadata for all registered providers.
 */
export function listProviderMetadata(): ProviderMetadata[] {
  assertServerOnly('listProviderMetadata')
  return Array.from(getRegistryMap().values()).map((adapter) => ({
    id: adapter.id,
    name: adapter.name,
    models: adapter.models.map(copyModelOption),
    requiresBaseUrl: Boolean(adapter.requiresBaseUrl),
    apiKeyOptional: Boolean(adapter.apiKeyOptional),
  }))
}

/**
 * Removes a single provider adapter from the registry.
 */
export function unregisterProvider(id: string): boolean {
  assertServerOnly('unregisterProvider')
  return typeof id === 'string' && getRegistryMap().delete(id.trim())
}

/**
 * Clears all registered provider adapters (primarily for test isolation).
 */
export function clearProviders(): void {
  assertServerOnly('clearProviders')
  getRegistryMap().clear()
}
