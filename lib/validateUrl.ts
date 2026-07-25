import dns from 'dns/promises'

// Regex patterns for private/reserved IPv4 ranges
const PRIVATE_IPV4 = [
  /^127\./,                                       // loopback
  /^10\./,                                        // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./,                  // RFC1918
  /^192\.168\./,                                  // RFC1918
  /^169\.254\./,                                  // link-local / AWS metadata
  /^0\./,                                         // unspecified
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,   // CGNAT RFC6598
  /^192\.0\.0\./,                                 // IETF Protocol Assignments
  /^198\.(18|19)\./,                              // benchmarking
  /^198\.51\.100\./,                              // TEST-NET-2
  /^203\.0\.113\./,                               // TEST-NET-3
  /^240\./,                                       // reserved
  /^255\.255\.255\.255$/,                         // broadcast
]

function isPrivateIPv4(ip: string): boolean {
  return PRIVATE_IPV4.some(r => r.test(ip))
}

/** Extract the IPv4 address embedded in an IPv4-mapped IPv6 address, if any. */
function embeddedIPv4(lower: string): string | null {
  // Dotted form: ::ffff:169.254.169.254
  const dotted = lower.match(/^(?:0:0:0:0:0|::)?:ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (dotted) return dotted[1]
  // Hex form: ::ffff:a9fe:a9fe (how WHATWG URL serializes mapped addresses)
  const hex = lower.match(/^(?:0:0:0:0:0|::)?:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
  }
  return null
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '')
  // IPv4-mapped addresses inherit the full IPv4 range checks — otherwise
  // ::ffff:169.254.169.254 would sail past to the cloud metadata endpoint.
  const mapped = embeddedIPv4(lower)
  if (mapped) return isPrivateIPv4(mapped)
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80')
  )
}

export async function validatePublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Invalid URL')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs are allowed')
  }

  const host = parsed.hostname.toLowerCase()

  if (!host) throw new Error('Missing hostname')

  // Block by hostname patterns
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0'
  ) {
    throw new Error('Internal hostnames are not allowed')
  }

  // Direct IP check (IPv4)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (isPrivateIPv4(host)) throw new Error('Private IP addresses are not allowed')
    return
  }

  // Direct IP check (IPv6, bracketed in URL)
  if (host.startsWith('[') || host.includes(':')) {
    if (isPrivateIPv6(host)) throw new Error('Private IP addresses are not allowed')
    return
  }

  // DNS resolution — catch cases where a hostname resolves to a private IP
  const [ipv4, ipv6] = await Promise.all([
    dns.resolve4(host).catch(() => [] as string[]),
    dns.resolve6(host).catch(() => [] as string[]),
  ])

  for (const addr of ipv4) {
    if (isPrivateIPv4(addr)) throw new Error('URL resolves to a private address')
  }
  for (const addr of ipv6) {
    if (isPrivateIPv6(addr)) throw new Error('URL resolves to a private address')
  }
}

/**
 * SSRF-safe fetch: validates the URL, disables automatic redirects, and
 * re-validates the Location header on every hop. Prevents a public host from
 * `302`-redirecting us to 169.254.169.254 (cloud metadata) or any private
 * range. Caller is responsible for the rest of the fetch options.
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  opts: { maxRedirects?: number } = {},
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 3
  let current = url

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await validatePublicUrl(current)

    const res = await fetch(current, { ...init, redirect: 'manual' })

    if (res.status < 300 || res.status >= 400) return res

    const location = res.headers.get('location')
    if (!location) return res

    if (hop === maxRedirects) {
      throw new Error('Too many redirects')
    }

    // Resolve relative redirects against the URL we just fetched.
    current = new URL(location, current).toString()
  }

  throw new Error('Too many redirects')
}
