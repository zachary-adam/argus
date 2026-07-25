/**
 * Detects what type of OSINT entity a raw string is.
 * Used by the Paste import tab to auto-classify a dump of indicators.
 */
import { GraphNodeType } from '@/types'

export interface DetectedEntity {
  raw: string
  type: GraphNodeType
  label: string
  confidence: 'high' | 'medium' | 'low'
  color: string
}

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/
const IPV6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(\/\d{1,3})?$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const URL_RE = /^https?:\/\//i
const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i
const PHONE = /^\+?[1-9]\d{7,14}$/
const MD5 = /^[a-f0-9]{32}$/i
const SHA1 = /^[a-f0-9]{40}$/i
const SHA256 = /^[a-f0-9]{64}$/i
const SHA512 = /^[a-f0-9]{128}$/i
const CVE = /^CVE-\d{4}-\d{4,}$/i
const BITCOIN = /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/
const ETHEREUM = /^0x[a-fA-F0-9]{40}$/
const ASN = /^AS\d+$/i

export const TYPE_COLORS: Record<GraphNodeType, string> = {
  ip:           '#1C5D7A',
  domain:       '#6B42A8',
  email:        '#3D7C66',
  url:          '#2E4F9E',
  phone:        '#9A7517',
  person:       '#A83270',
  organization: '#C2691C',
  country:      '#3FA6CC',
  hash:         '#5E6B7A',
  wallet:       '#9A7517',
  cve:          '#BE1E3A',
  event:        '#1C5D7A',
  custom:       '#8A9099',
}

export function detectEntity(raw: string): DetectedEntity {
  const s = raw.trim()

  if (CVE.test(s))
    return { raw: s, type: 'cve', label: s.toUpperCase(), confidence: 'high', color: TYPE_COLORS.cve }

  if (ETHEREUM.test(s))
    return { raw: s, type: 'wallet', label: `ETH: ${s.slice(0, 10)}…`, confidence: 'high', color: TYPE_COLORS.wallet }

  if (BITCOIN.test(s) && s.length >= 26)
    return { raw: s, type: 'wallet', label: `BTC: ${s.slice(0, 10)}…`, confidence: 'medium', color: TYPE_COLORS.wallet }

  if (SHA512.test(s))
    return { raw: s, type: 'hash', label: `SHA-512: ${s.slice(0, 12)}…`, confidence: 'high', color: TYPE_COLORS.hash }

  if (SHA256.test(s))
    return { raw: s, type: 'hash', label: `SHA-256: ${s.slice(0, 12)}…`, confidence: 'high', color: TYPE_COLORS.hash }

  if (SHA1.test(s))
    return { raw: s, type: 'hash', label: `SHA-1: ${s.slice(0, 12)}…`, confidence: 'high', color: TYPE_COLORS.hash }

  if (MD5.test(s))
    return { raw: s, type: 'hash', label: `MD5: ${s.slice(0, 12)}…`, confidence: 'medium', color: TYPE_COLORS.hash }

  if (EMAIL.test(s))
    return { raw: s, type: 'email', label: s, confidence: 'high', color: TYPE_COLORS.email }

  if (URL_RE.test(s))
    return { raw: s, type: 'url', label: s.length > 60 ? s.slice(0, 60) + '…' : s, confidence: 'high', color: TYPE_COLORS.url }

  if (PHONE.test(s.replace(/[\s\-().]/g, '')))
    return { raw: s, type: 'phone', label: s, confidence: 'medium', color: TYPE_COLORS.phone }

  if (IPV4.test(s)) {
    const isValid = s.split('/')[0].split('.').every(o => parseInt(o) <= 255)
    if (isValid) return { raw: s, type: 'ip', label: s, confidence: 'high', color: TYPE_COLORS.ip }
  }

  if (IPV6.test(s))
    return { raw: s, type: 'ip', label: s, confidence: 'high', color: TYPE_COLORS.ip }

  if (ASN.test(s))
    return { raw: s, type: 'organization', label: s.toUpperCase(), confidence: 'high', color: TYPE_COLORS.organization }

  if (DOMAIN.test(s) && !s.includes(' ') && s.includes('.'))
    return { raw: s, type: 'domain', label: s, confidence: 'medium', color: TYPE_COLORS.domain }

  return { raw: s, type: 'custom', label: s.slice(0, 60), confidence: 'low', color: TYPE_COLORS.custom }
}

export function detectBulk(text: string): DetectedEntity[] {
  return text
    .split(/[\n,;|\t]+/)
    .map(line => line.trim())
    .filter(line => line.length > 2 && line.length < 512)
    .map(detectEntity)
}
