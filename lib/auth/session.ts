/**
 * JWT session management using `jose`.
 * Session is stored in an HTTP-only cookie signed with ARGUS_SESSION_SECRET.
 * Auth is password-based: ARGUS_PASSWORD env var (single analyst tool).
 */
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const COOKIE = 'argus_session'
const EXPIRY = '7d'

function getSecret(): Uint8Array {
  const raw = process.env.ARGUS_SESSION_SECRET
  if (raw) return new TextEncoder().encode(raw.padEnd(32, '0').slice(0, 32))
  // No secret configured. When password protection is off (zero-config local
  // mode, as the README promises), fall back to a deterministic dev secret so
  // local sessions work without any env setup. When ARGUS_PASSWORD *is* set,
  // refuse — a guessable fallback would defeat the password protection.
  if (!process.env.ARGUS_PASSWORD) {
    return new TextEncoder().encode('argus-local-dev-secret-do-not-use'.padEnd(32, '0').slice(0, 32))
  }
  throw new Error(
    'ARGUS_SESSION_SECRET not set — required when ARGUS_PASSWORD is set. Generate one with: openssl rand -hex 32',
  )
}

export interface SessionUser {
  id: string
  email: string
}

export async function createSession(user: SessionUser): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret())
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const store = await cookies()
    const token = store.get(COOKIE)?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, getSecret())
    return (payload.user as SessionUser) ?? null
  } catch {
    return null
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies()
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.delete(COOKIE)
}

export function checkPassword(input: string): boolean {
  const stored = process.env.ARGUS_PASSWORD
  if (!stored) return true // No password set → always authenticated (local-only mode)
  return input === stored
}
