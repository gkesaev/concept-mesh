import { ProviderError } from '@/lib/ai/adapters/types'

const BLOCKED_METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
  'instance-data',
])

const BLOCKED_METADATA_IPV4 = new Set([
  '0.0.0.0',
  '100.100.100.200', // Alibaba Cloud IMDS
  '192.0.0.192', // Oracle Cloud IMDS
])

const IPV6_LINK_LOCAL_PATTERN = /^fe[89ab][0-9a-f]:/
const IPV6_ULA_PATTERN = /^f[cd][0-9a-f]{2}:/
const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const IPV4_HEX_EMBEDDED_PATTERN = /^(?:::ffff:(?:0:)?|::|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/
const IPV4_DOTTED_MAPPED_PATTERN = /^::ffff:(?:0:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/

export interface ValidateBaseUrlOptions {
  /** Explicitly allow loopback/private-network hosts (e.g. local Ollama). */
  allowLocalHosts?: boolean
  /** Optional env override (reads `NODE_ENV` and `ALLOW_LOCAL_PROVIDERS`). */
  env?: NodeJS.ProcessEnv
}

function parseIpv4Octets(ip: string): [number, number, number, number] | null {
  const match = IPV4_PATTERN.exec(ip)
  if (!match) return null
  const octets = match.slice(1).map((part) => Number(part))
  if (octets.some((n) => n < 0 || n > 255)) return null
  return octets as [number, number, number, number]
}

function extractEmbeddedIpv4(host: string): string | null {
  if (IPV4_PATTERN.test(host)) return host

  const dottedMatch = IPV4_DOTTED_MAPPED_PATTERN.exec(host)
  if (dottedMatch) return dottedMatch[1]

  const hexMatch = IPV4_HEX_EMBEDDED_PATTERN.exec(host)
  if (!hexMatch) return null
  const hi = Number.parseInt(hexMatch[1], 16)
  const lo = Number.parseInt(hexMatch[2], 16)
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
}

function isBlockedMetadataHost(host: string): boolean {
  if (BLOCKED_METADATA_HOSTS.has(host)) return true
  if (host === '::' || host === 'fd00:ec2::254' || IPV6_LINK_LOCAL_PATTERN.test(host)) {
    return true
  }

  const ipv4 = extractEmbeddedIpv4(host)
  if (!ipv4) return false
  if (BLOCKED_METADATA_IPV4.has(ipv4)) return true
  const octets = parseIpv4Octets(ipv4)
  if (!octets) return false
  // 0.0.0.0/8 ("this network") and 169.254.0.0/16 (AWS/GCP/Azure/ECS link-local & IMDS)
  return octets[0] === 0 || (octets[0] === 169 && octets[1] === 254)
}

function isLoopbackHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true
  const ipv4 = extractEmbeddedIpv4(host)
  const octets = ipv4 ? parseIpv4Octets(ipv4) : null
  return octets != null && octets[0] === 127
}

function isPrivateNetworkHost(host: string): boolean {
  if (IPV6_ULA_PATTERN.test(host)) return true
  const ipv4 = extractEmbeddedIpv4(host)
  const octets = ipv4 ? parseIpv4Octets(ipv4) : null
  if (!octets) return false
  const [a, b] = octets
  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10 (CGNAT)
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

function areLocalHostsAllowed(options?: ValidateBaseUrlOptions): boolean {
  if (options?.allowLocalHosts != null) return options.allowLocalHosts
  const env = options?.env ?? process.env
  if (env.ALLOW_LOCAL_PROVIDERS === 'true') return true
  return env.NODE_ENV !== 'production'
}

/**
 * Validates a custom provider base URL against SSRF and cleartext leakage:
 * - Requires http(s) with no embedded credentials, query string, or fragment.
 * - Unconditionally blocks cloud metadata, unspecified, and link-local hosts.
 * - Requires HTTPS for all non-loopback hosts (plaintext HTTP allowed only for loopback/Ollama).
 * - Blocks loopback and private-network hosts in production unless `ALLOW_LOCAL_PROVIDERS=true`.
 *
 * Note: Concrete HTTP adapters (#14) should also validate resolved IPs at connect time to defend
 * against DNS rebinding attacks.
 */
export function validateBaseUrl(rawUrl: unknown, options?: ValidateBaseUrlOptions): string {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    throw new ProviderError('MISSING_BASE_URL', 'Base URL cannot be empty')
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new ProviderError('INVALID_CONFIG', 'Base URL must be a valid http(s) URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ProviderError('INVALID_CONFIG', 'Base URL must use http or https protocol')
  }
  if (parsed.username || parsed.password) {
    throw new ProviderError('INVALID_CONFIG', 'Base URL must not embed credentials')
  }
  if (parsed.search || parsed.hash) {
    throw new ProviderError('INVALID_CONFIG', 'Base URL must not contain query parameters or fragments')
  }

  // Strip brackets and trailing DNS root dots to prevent FQDN bypasses (e.g. metadata.google.internal.)
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '')
  if (!host || isBlockedMetadataHost(host)) {
    throw new ProviderError('INVALID_CONFIG', 'Base URL targets a disallowed metadata host')
  }

  const isLoopback = isLoopbackHost(host)
  const isPrivate = isLoopback || isPrivateNetworkHost(host)
  if (isPrivate && !areLocalHostsAllowed(options)) {
    throw new ProviderError(
      'INVALID_CONFIG',
      'Local and private-network provider base URLs are disabled in production',
    )
  }

  if (parsed.protocol === 'http:' && !isLoopback) {
    throw new ProviderError(
      'INVALID_CONFIG',
      'Non-loopback provider base URLs must use https',
    )
  }

  return parsed.toString().replace(/\/+$/, '')
}
