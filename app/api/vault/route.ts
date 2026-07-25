import { NextRequest, NextResponse } from 'next/server'
import { vaultSet, vaultList, vaultConfigured } from '@/lib/vault'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

// GET /api/vault — returns stored key names only, never values
export async function GET() {
  if (!vaultConfigured()) {
    return NextResponse.json({ configured: false, keys: [] })
  }
  return NextResponse.json({ configured: true, keys: vaultList() })
}

// POST /api/vault — encrypt and store a key
export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!checkRateLimit(`vault-write:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  if (!vaultConfigured()) {
    return NextResponse.json(
      { error: 'Vault not configured. Add VAULT_MASTER_KEY to .env.local and restart.' },
      { status: 503 }
    )
  }

  try {
    const { name, value } = await req.json()
    if (!name || typeof name !== 'string' || !/^[A-Z0-9_]{1,80}$/.test(name)) {
      return NextResponse.json({ error: 'name must be uppercase letters, digits, underscores, max 80 chars' }, { status: 400 })
    }
    if (!value || typeof value !== 'string' || value.length > 4096) {
      return NextResponse.json({ error: 'Invalid value' }, { status: 400 })
    }
    vaultSet(name, value.trim())
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to save key' }, { status: 500 })
  }
}
