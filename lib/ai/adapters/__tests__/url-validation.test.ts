import { describe, expect, it } from 'vitest'
import { ProviderError } from '@/lib/ai/adapters/types'
import { validateBaseUrl } from '@/lib/ai/adapters/url-validation'

const DEV_ENV: NodeJS.ProcessEnv = { NODE_ENV: 'development' }
const PROD_ENV: NodeJS.ProcessEnv = { NODE_ENV: 'production' }

describe('validateBaseUrl', () => {
  it('allows valid HTTPS endpoints and strips trailing slashes', () => {
    expect(validateBaseUrl('https://api.groq.com/openai/v1/', { env: PROD_ENV })).toBe(
      'https://api.groq.com/openai/v1',
    )
    expect(validateBaseUrl('https://api.together.xyz/v1', { env: PROD_ENV })).toBe(
      'https://api.together.xyz/v1',
    )
  })

  it('allows loopback HTTP (e.g. Ollama) in dev or when ALLOW_LOCAL_PROVIDERS=true', () => {
    expect(validateBaseUrl('http://localhost:11434/v1/', { env: DEV_ENV })).toBe(
      'http://localhost:11434/v1',
    )
    expect(validateBaseUrl('http://127.0.0.1:11434/v1', { env: DEV_ENV })).toBe(
      'http://127.0.0.1:11434/v1',
    )
    expect(validateBaseUrl('http://[::1]:11434/v1', { env: DEV_ENV })).toBe(
      'http://[::1]:11434/v1',
    )
    expect(
      validateBaseUrl('http://localhost:11434/v1', {
        env: { NODE_ENV: 'production', ALLOW_LOCAL_PROVIDERS: 'true' },
      }),
    ).toBe('http://localhost:11434/v1')
  })

  it('blocks loopback and RFC1918/private hosts in production by default', () => {
    const privateUrls = [
      'http://localhost:11434/v1',
      'https://sub.localhost/v1',
      'http://127.0.0.1:11434/v1',
      'http://[::1]:11434/v1',
      'https://10.0.0.5/v1',
      'https://172.16.10.2/v1',
      'https://192.168.1.50/v1',
      'https://100.64.0.1/v1',
      'https://[fc00::1]/v1',
      'https://[fd12:3456::1]/v1',
    ]
    for (const url of privateUrls) {
      expect(() => validateBaseUrl(url, { env: PROD_ENV })).toThrowError(ProviderError)
    }
  })

  it('blocks cleartext HTTP for non-loopback hosts even in development', () => {
    expect(() => validateBaseUrl('http://api.groq.com/openai/v1', { env: DEV_ENV })).toThrowError(
      ProviderError,
    )
    expect(() => validateBaseUrl('http://192.168.1.10:8080/v1', { env: DEV_ENV })).toThrowError(
      ProviderError,
    )
  })

  it('unconditionally blocks cloud metadata, link-local, trailing-dot, and IPv4-mapped bypasses', () => {
    const blockedUrls = [
      'http://169.254.169.254/latest/meta-data',
      'https://169.254.170.2/v2/credentials',
      'https://metadata.google.internal/computeMetadata/v1',
      'https://metadata.google.internal./computeMetadata/v1',
      'https://metadata./v1',
      'https://metadata.goog./v1',
      'https://instance-data./v1',
      'https://100.100.100.200/latest/meta-data',
      'https://192.0.0.192/opc/v2/instance',
      'http://0.0.0.0:11434/v1',
      'https://0.1.2.3/v1',
      'http://[::]:11434/v1',
      'https://[::ffff:0.0.0.0]/v1',
      'https://[::ffff:169.254.169.254]/v1',
      'https://[::ffff:0:a9fe:a9fe]/v1',
      'https://[::a9fe:a9fe]/v1',
      'https://[64:ff9b::a9fe:a9fe]/v1',
      'https://[fd00:ec2::254]/latest/meta-data',
      'https://[fe80::1]/v1',
      'https://[febf::1]/v1',
    ]
    for (const url of blockedUrls) {
      expect(() => validateBaseUrl(url, { env: DEV_ENV, allowLocalHosts: true })).toThrowError(
        ProviderError,
      )
    }
  })

  it('rejects non-http schemes, embedded credentials, query strings, fragments, and non-strings', () => {
    expect(() => validateBaseUrl('file:///etc/passwd')).toThrowError(ProviderError)
    expect(() => validateBaseUrl('javascript:alert(1)')).toThrowError(ProviderError)
    expect(() => validateBaseUrl('https://user:pass@api.example.com/v1')).toThrowError(ProviderError)
    expect(() => validateBaseUrl('https://api.example.com/v1?key=1')).toThrowError(ProviderError)
    expect(() => validateBaseUrl('https://api.example.com/v1#frag')).toThrowError(ProviderError)
    expect(() => validateBaseUrl('')).toThrowError(ProviderError)
    expect(() => validateBaseUrl(123 as unknown as string)).toThrowError(ProviderError)
  })
})
