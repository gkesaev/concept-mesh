import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = vi.fn()
const mockFindFirst = vi.fn()
const mockDecrypt = vi.fn()

vi.mock('@/lib/auth', () => ({
  auth: () => mockAuth(),
}))

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      users: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
  },
}))

vi.mock('@/lib/crypto', () => ({
  decrypt: (value: string) => mockDecrypt(value),
}))

import { getStoredUserAnthropicKey } from '@/lib/ai/client'

describe('getStoredUserAnthropicKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when unauthenticated or when user has no stored key', async () => {
    mockAuth.mockResolvedValueOnce(null)
    expect(await getStoredUserAnthropicKey()).toBeNull()
    expect(mockFindFirst).not.toHaveBeenCalled()

    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1' } })
    mockFindFirst.mockResolvedValueOnce({ encryptedApiKey: null })
    expect(await getStoredUserAnthropicKey()).toBeNull()
  })

  it('returns the decrypted key for an authenticated user', async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1' } })
    mockFindFirst.mockResolvedValueOnce({ encryptedApiKey: 'iv:tag:cipher' })
    mockDecrypt.mockReturnValueOnce('sk-ant-stored-key')

    expect(await getStoredUserAnthropicKey()).toBe('sk-ant-stored-key')
    expect(mockDecrypt).toHaveBeenCalledWith('iv:tag:cipher')
  })

  it('logs and returns null instead of throwing when decryption fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAuth.mockResolvedValueOnce({ user: { id: 'user-1' } })
    mockFindFirst.mockResolvedValueOnce({ encryptedApiKey: 'corrupt-ciphertext' })
    mockDecrypt.mockImplementationOnce(() => {
      throw new Error('ENCRYPTION_KEY environment variable is required')
    })

    expect(await getStoredUserAnthropicKey()).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(
      '[ai/client] Failed to decrypt stored user API key',
      expect.objectContaining({ userId: 'user-1' }),
    )
  })
})
