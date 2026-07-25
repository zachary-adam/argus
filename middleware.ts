import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { jwtVerify } from 'jose'

const IS_CLOUD = process.env.NEXT_PUBLIC_MODE === 'cloud'
const HAS_PASSWORD = !!process.env.ARGUS_PASSWORD

// Public paths that never require auth — share links, the login page itself,
// and the auth APIs that own their gating.
const PUBLIC = ['/auth/login', '/auth/callback', '/auth/reset', '/api/auth', '/share']

// Anonymous share links only need to READ a snapshot; creation and deletion
// stay behind the auth gate like every other API route.
function isPublicSnapshotRead(request: NextRequest, pathname: string): boolean {
  return request.method === 'GET' && /^\/api\/snapshots\/[^/]+$/.test(pathname)
}

function secretKey(): Uint8Array | null {
  const raw = process.env.ARGUS_SESSION_SECRET
  if (!raw) return null
  return new TextEncoder().encode(raw.padEnd(32, '0').slice(0, 32))
}

function loginRedirect(request: NextRequest, pathname: string) {
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/auth/login'
  loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}

function unauthorizedJson() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Dev-only: set ARGUS_DEV_OPEN=true in .env.local to skip the password gate while testing UI.
  if (process.env.NODE_ENV === 'development' && process.env.ARGUS_DEV_OPEN === 'true') {
    return NextResponse.next()
  }

  // Pure-local mode with no password set → fully open (intentional).
  if (!IS_CLOUD && !HAS_PASSWORD) return NextResponse.next()

  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next()
  if (isPublicSnapshotRead(request, pathname)) return NextResponse.next()

  // Cloud mode → enforce Supabase session.
  if (IS_CLOUD) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    let response = NextResponse.next({ request })

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return pathname.startsWith('/api/') ? unauthorizedJson() : loginRedirect(request, pathname)
    }
    return response
  }

  // Local/hybrid with ARGUS_PASSWORD set → enforce the JWT session cookie.
  // Without this gate, any new route that forgot its own check would be fully open.
  const token = request.cookies.get('argus_session')?.value
  const secret = secretKey()
  let valid = false
  if (token && secret) {
    try { await jwtVerify(token, secret); valid = true } catch { /* fall through */ }
  }
  if (!valid) {
    return pathname.startsWith('/api/') ? unauthorizedJson() : loginRedirect(request, pathname)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|logo.svg|fonts).*)'],
}
