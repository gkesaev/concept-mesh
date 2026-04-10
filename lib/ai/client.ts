import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { decrypt } from '@/lib/crypto'

export const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5'

/**
 * Get an Anthropic client using the authenticated user's API key.
 * Falls back to the server ANTHROPIC_API_KEY if set.
 * Throws if no key is available.
 */
export async function getAnthropicClient(): Promise<Anthropic> {
  // Try user's own key first
  const session = await auth()
  const userId = session?.user?.id
  if (userId) {
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, userId),
      columns: { encryptedApiKey: true },
    })

    if (user?.encryptedApiKey) {
      const apiKey = decrypt(user.encryptedApiKey)
      return new Anthropic({ apiKey })
    }
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
