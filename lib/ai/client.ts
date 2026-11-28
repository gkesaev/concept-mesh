import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { decrypt } from '@/lib/crypto'

export const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5'

/**
 * Reads and decrypts the signed-in user's legacy DB-stored Anthropic API key, if present.
 * Intended as an optional fallback for `resolveProvider({ loadLegacyUserApiKey })`.
 * Returns `null` if decryption fails (e.g. missing/rotated ENCRYPTION_KEY) so callers fall back cleanly.
 */
export async function getStoredUserAnthropicKey(): Promise<string | null> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return null

  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
    columns: { encryptedApiKey: true },
  })

  if (!user?.encryptedApiKey) return null

  try {
    return decrypt(user.encryptedApiKey)
  } catch (err) {
    console.error('[ai/client] Failed to decrypt stored user API key', {
      userId,
      reason: err instanceof Error ? err.message : 'unknown error',
    })
    return null
  }
}

/**
 * Get an Anthropic client using the authenticated user's API key.
 * Falls back to the server ANTHROPIC_API_KEY if set.
 * Throws if no key is available.
 */
export async function getAnthropicClient(): Promise<Anthropic> {
  // Try user's own key first
  const userKey = await getStoredUserAnthropicKey()
  if (userKey) {
    return new Anthropic({ apiKey: userKey })
  }

  // Fall back to server key
  if (process.env.ANTHROPIC_API_KEY) {
    return new Anthropic()
  }

  // Operator-level default (DEFAULT_PROVIDER / DEFAULT_API_KEY)
  const defaultProvider = process.env.DEFAULT_PROVIDER || 'anthropic'
  if (defaultProvider === 'anthropic' && process.env.DEFAULT_API_KEY) {
    return new Anthropic({ apiKey: process.env.DEFAULT_API_KEY })
  }

  throw new Error('No API key available. Please add your Anthropic API key in settings.')
}
