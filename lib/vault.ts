/**
 * Server-side AES-256-GCM encrypted key vault.
 *
 * Keys are encrypted with a master key from VAULT_MASTER_KEY env var and
 * written to .vault.enc.json at the project root. The plaintext of any stored
 * key never leaves the server — API routes read directly from here instead of
 * receiving keys from the client in request bodies.
 *
 * Generate a master key:
 *   python3 -c "import os,base64; print('base64:'+base64.b64encode(os.urandom(32)).decode())"
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const VAULT_FILE = join(process.cwd(), '.vault.enc.json')
const ALGO = 'aes-256-gcm'

function masterKey(): Buffer {
  const raw = process.env.VAULT_MASTER_KEY
  if (!raw) throw new Error('VAULT_MASTER_KEY is not set in environment')
  const b64 = raw.startsWith('base64:') ? raw.slice(7) : raw
  const key = Buffer.from(b64, 'base64')
  if (key.length !== 32) throw new Error('VAULT_MASTER_KEY must decode to 32 bytes')
  return key
}

interface Entry { iv: string; ct: string; tag: string }
type Store = Record<string, Entry>

function load(): Store {
  if (!existsSync(VAULT_FILE)) return {}
  try { return JSON.parse(readFileSync(VAULT_FILE, 'utf-8')) } catch { return {} }
}

function save(s: Store) {
  writeFileSync(VAULT_FILE, JSON.stringify(s, null, 2), { mode: 0o600 })
}

export function vaultSet(name: string, value: string): void {
  const key = masterKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(value, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const store = load()
  store[name] = { iv: iv.toString('hex'), ct: ct.toString('hex'), tag: tag.toString('hex') }
  save(store)
}

export function vaultGet(name: string): string | null {
  try {
    const key = masterKey()
    const e = load()[name]
    if (!e) return null
    const decipher = createDecipheriv(ALGO, key, Buffer.from(e.iv, 'hex'))
    decipher.setAuthTag(Buffer.from(e.tag, 'hex'))
    return Buffer.concat([
      decipher.update(Buffer.from(e.ct, 'hex')),
      decipher.final(),
    ]).toString('utf-8')
  } catch { return null }
}

export function vaultDelete(name: string): void {
  const store = load(); delete store[name]; save(store)
}

export function vaultList(): string[] { return Object.keys(load()) }

export function vaultHas(name: string): boolean { return name in load() }

export function vaultConfigured(): boolean {
  try { masterKey(); return true } catch { return false }
}
