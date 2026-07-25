import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { vaultSet, vaultConfigured } from '@/lib/vault'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')

  const cookieStore = await cookies()
  const savedState  = cookieStore.get('gh_oauth_state')?.value
  cookieStore.delete('gh_oauth_state')

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${origin}/?oauth_error=invalid_state`)
  }

  // Server-to-server token exchange — client_secret never leaves the server
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/?oauth_error=token_exchange_failed`)
  }

  const { access_token, error: ghError } = await tokenRes.json()

  if (!access_token) {
    return NextResponse.redirect(`${origin}/?oauth_error=${ghError ?? 'no_token'}`)
  }

  // Fetch GitHub username for UI display only.
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${access_token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  const user = userRes.ok ? await userRes.json() : { login: 'unknown' }

  // Stash the token in the encrypted vault — same path every other API key in
  // ARGUS takes. The token never reaches the browser, so XSS can't steal it.
  // Server-side GitHub routes read it back with vaultGet('GITHUB_ACCESS_TOKEN').
  if (!vaultConfigured()) {
    return NextResponse.redirect(`${origin}/?oauth_error=vault_not_configured`)
  }
  try {
    vaultSet('GITHUB_ACCESS_TOKEN', access_token)
  } catch {
    return NextResponse.redirect(`${origin}/?oauth_error=vault_write_failed`)
  }

  // Username alone isn't sensitive — short-lived non-httpOnly so the UI can
  // show "Connected as <login>" once after the redirect.
  const response = NextResponse.redirect(`${origin}/?gh_connected=1`)
  response.cookies.set('gh_pending_login', user.login, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 120,
    path: '/',
  })
  return response
}
