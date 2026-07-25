import { NextResponse } from 'next/server'
import { getSession, createSession, setSessionCookie } from '@/lib/auth/session'

export async function GET() {
  let user = await getSession()

  // Local mode (no password set) — auto-authenticate so the modal never appears
  if (!user && !process.env.ARGUS_PASSWORD) {
    user = { id: 'local', email: 'analyst@argus.local' }
    const token = await createSession(user)
    const res = NextResponse.json({ user })
    await setSessionCookie(token)
    return res
  }

  if (!user) return NextResponse.json({ user: null }, { status: 401 })
  return NextResponse.json({ user })
}
