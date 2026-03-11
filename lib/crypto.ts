import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is required')
  // Key must be 32 bytes for AES-256. Accept hex-encoded (64 chars) or base64 (44 chars).
  if (key.length === 64) return Buffer.from(key, 'hex')
  return Buffer.from(key, 'base64')
}

/**
 * Encrypt a plaintext string. Returns base64-encoded `iv:authTag:ciphertext`.
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  const authTag = cipher.getAuthTag()

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
}

/**
 * Decrypt a string produced by `encrypt()`. Returns plaintext.
 */
export function decrypt(encryptedStr: string): string {
  const key = getEncryptionKey()
  const [ivB64, authTagB64, ciphertext] = encryptedStr.split(':')
  if (!ivB64 || !authTagB64 || !ciphertext) throw new Error('Invalid encrypted format')

  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(authTagB64, 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
