import { describe, expect, it } from 'vitest'
import { ProviderError } from '@/lib/ai/adapters/types'
import {
  PROVIDER_SESSION_COOKIE,
  buildClearProviderSessionCookie,
  buildProviderSessionCookie,
  maskApiKey,
  parseCookieHeader,
  readSessionCredentialsFromRequest,
} from '@/lib/ai/session-cookie'
import {
  clampSessionTtl,
  decryptSessionCredentials,
  encryptSessionCredentials,
} from '@/lib/ai/session-key'

const TEST_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
}

describe('session-key encryption and HttpOnly cookie storage', () => {
  it('round-trips credentials with unique random IVs and no plaintext leakage', () => {
    const creds = {
      providerId: 'anthropic',
      apiKey: 'sk-ant-api03-super-secret-value-1234',
      model: 'claude-sonnet-4-20250514',
    }
    const nowMs = 1_700_000_000_000

    const tokenA = encryptSessionCredentials(creds, { env: TEST_ENV, nowMs })
    const tokenB = encryptSessionCredentials(creds, { env: TEST_ENV, nowMs })

    expect(tokenA).not.toBe(tokenB)
    expect(tokenA).not.toContain(creds.apiKey)
    expect(tokenA).not.toContain('anthropic')
    expect(decryptSessionCredentials(tokenA, { env: TEST_ENV, nowMs: nowMs + 10_000 })).toEqual(creds)
  })

  it('rejects tampered version, IV, auth tag, ciphertext, wrong key, and oversized tokens', () => {
    const issuedAtMs = 1_700_000_000_000
    const checkMs = issuedAtMs + 1_000
    const token = encryptSessionCredentials(
      { providerId: 'openai', apiKey: 'sk-proj-secret-key-9999' },
      { env: TEST_ENV, nowMs: issuedAtMs },
    )
    expect(decryptSessionCredentials(token, { env: TEST_ENV, nowMs: checkMs })).toEqual({
      providerId: 'openai',
      apiKey: 'sk-proj-secret-key-9999',
    })

    const parts = token.split('.')
    expect(parts).toHaveLength(4)

    const flipDecodedByte = (segment: string) => {
      const buf = Buffer.from(segment, 'base64url')
      buf[0] ^= 0xff
      return buf.toString('base64url')
    }

    expect(decryptSessionCredentials(['v2', parts[1], parts[2], parts[3]].join('.'), { env: TEST_ENV, nowMs: checkMs })).toBeNull()
    expect(decryptSessionCredentials([parts[0], flipDecodedByte(parts[1]), parts[2], parts[3]].join('.'), { env: TEST_ENV, nowMs: checkMs })).toBeNull()
    expect(decryptSessionCredentials([parts[0], parts[1], flipDecodedByte(parts[2]), parts[3]].join('.'), { env: TEST_ENV, nowMs: checkMs })).toBeNull()
    expect(decryptSessionCredentials([parts[0], parts[1], parts[2], flipDecodedByte(parts[3])].join('.'), { env: TEST_ENV, nowMs: checkMs })).toBeNull()
    expect(
      decryptSessionCredentials(token, {
        env: { NODE_ENV: 'test', ENCRYPTION_KEY: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210' },
        nowMs: checkMs,
      }),
    ).toBeNull()
    expect(decryptSessionCredentials('', { env: TEST_ENV, nowMs: checkMs })).toBeNull()
    expect(decryptSessionCredentials('v1.bad!.chars.here', { env: TEST_ENV, nowMs: checkMs })).toBeNull()
    expect(decryptSessionCredentials('v1.' + 'a'.repeat(4100), { env: TEST_ENV, nowMs: checkMs })).toBeNull()
  })

  it('enforces TTL expiration and clamps out-of-range TTL values', () => {
    expect(clampSessionTtl(undefined)).toBe(86_400)
    expect(clampSessionTtl(Number.NaN)).toBe(86_400)
    expect(clampSessionTtl(5)).toBe(60)
    expect(clampSessionTtl(999_999_999)).toBe(604_800)

    const startMs = 1_700_000_000_000
    const token = encryptSessionCredentials(
      { providerId: 'anthropic', apiKey: 'sk-ant-expiring-key' },
      { env: TEST_ENV, nowMs: startMs, ttlSeconds: 120 },
    )
    expect(decryptSessionCredentials(token, { env: TEST_ENV, nowMs: startMs + 119_000 })).not.toBeNull()
    expect(decryptSessionCredentials(token, { env: TEST_ENV, nowMs: startMs + 120_000 })).toBeNull()
  })

  it('requires >=32-char secret, falls back to AUTH_SECRET, and validates payload limits and inputs', () => {
    const authEnv: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      AUTH_SECRET: 'test-auth-secret-material-with-sufficient-entropy',
    }
    const token = encryptSessionCredentials(
      { providerId: 'openai', apiKey: '  sk-test-123456789  ' },
      { env: authEnv },
    )
    expect(decryptSessionCredentials(token, { env: authEnv })?.apiKey).toBe('sk-test-123456789')

    expect(() =>
      encryptSessionCredentials({ providerId: 'openai', apiKey: 'sk-test' }, { env: { NODE_ENV: 'test' } }),
    ).toThrowError(ProviderError)
    expect(() =>
      encryptSessionCredentials(
        { providerId: 'openai', apiKey: 'sk-test' },
        { env: { NODE_ENV: 'test', ENCRYPTION_KEY: 'too-short' } },
      ),
    ).toThrowError(ProviderError)
    expect(() =>
      encryptSessionCredentials({ providerId: 'openai', apiKey: 'sk-bad\r\nkey' }, { env: TEST_ENV }),
    ).toThrowError(ProviderError)
    expect(() =>
      encryptSessionCredentials({ providerId: 'Invalid!', apiKey: 'sk-test' }, { env: TEST_ENV }),
    ).toThrowError(ProviderError)
    expect(() =>
      encryptSessionCredentials({ providerId: 'openai', apiKey: 'sk-test', model: 'a/../b' }, { env: TEST_ENV }),
    ).toThrowError(ProviderError)
    expect(() =>
      encryptSessionCredentials({ providerId: 'openai', apiKey: 'k'.repeat(2100) }, { env: TEST_ENV }),
    ).toThrowError(ProviderError)
  })

  it('builds HttpOnly cookies, sets Secure in prod, and survives shadowed duplicate cookies', () => {
    const nowMs = 1_700_000_000_000
    const setCookie = buildProviderSessionCookie(
      {
        providerId: 'custom-openai-compat',
        apiKey: '',
        baseUrl: 'http://localhost:11434/v1/',
        model: 'llama3.2',
      },
      { env: TEST_ENV, nowMs, ttlSeconds: 3600, secure: true },
    )
    expect(setCookie).toContain(`${PROVIDER_SESSION_COOKIE}=v1.`)
    expect(setCookie).toContain('HttpOnly; SameSite=Lax; Max-Age=3600; Secure')

    const validPair = setCookie.split(';')[0]
    const req = new Request('http://localhost:3000/api/cards/generate', {
      headers: { cookie: `${PROVIDER_SESSION_COOKIE}=; ${PROVIDER_SESSION_COOKIE}=corrupt; ${validPair}` },
    })
    expect(readSessionCredentialsFromRequest(req, { env: TEST_ENV, nowMs: nowMs + 1000 })).toEqual({
      providerId: 'custom-openai-compat',
      apiKey: '',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3.2',
    })

    const prodCookie = buildProviderSessionCookie(
      { providerId: 'anthropic', apiKey: 'sk-ant-prod-key' },
      { env: { ...TEST_ENV, NODE_ENV: 'production' } },
    )
    expect(prodCookie).toContain('; Secure')
    const devCookie = buildProviderSessionCookie(
      { providerId: 'anthropic', apiKey: 'sk-ant-dev-key' },
      { env: { ...TEST_ENV, NODE_ENV: 'development' } },
    )
    expect(devCookie).not.toContain('; Secure')

    expect(buildClearProviderSessionCookie({ secure: true })).toBe(
      `${PROVIDER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`,
    )
  })

  it('masks API keys safely, parses cookies accurately, and blocks browser execution', () => {
    expect(maskApiKey('')).toBe('')
    expect(maskApiKey('short')).toBe('••••')
    expect(maskApiKey('123456789')).toBe('••••')
    expect(maskApiKey('1234567890')).toBe('••••')
    expect(maskApiKey('123456789012')).toBe('••••')
    expect(maskApiKey('sk-ant-api03-abcdef1234')).toBe('sk-ant…1234')
    expect(parseCookieHeader('other_cm_provider_session=bad; cm_provider_session=tok123', PROVIDER_SESSION_COOKIE)).toBe('tok123')

    const globalRef = globalThis as Record<string, unknown>
    globalRef.window = {}
    try {
      expect(() =>
        encryptSessionCredentials({ providerId: 'anthropic', apiKey: 'sk-test' }, { env: TEST_ENV }),
      ).toThrowError(ProviderError)
      expect(() => decryptSessionCredentials('v1.a.b.c', { env: TEST_ENV })).toThrowError(ProviderError)
    } finally {
      delete globalRef.window
    }
  })
})
