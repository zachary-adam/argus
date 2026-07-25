import { NextRequest, NextResponse } from 'next/server'
import { checkPassword, createSession, setSessionCookie } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  if (!checkPassword(password)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }
  const user = { id: 'local', email: 'analyst@argus.local' }
  const token = await createSession(user)
  await setSessionCookie(token)
  return NextResponse.json({ user })
}
