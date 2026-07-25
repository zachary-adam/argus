/**
 * ACLED OAuth2 token management (myACLED password grant).
 * Legacy key+email query params were deprecated in 2025.
 */

const TOKEN_URL = 'https://acleddata.com/oauth/token'

let cache: { access: string; refresh: string; expiresAt: number } | null = null

async function requestToken(body: URLSearchParams): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`ACLED OAuth ${res.status}: ${text.slice(0, 200)}`)
  const data = JSON.parse(text) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string }
  if (!data.access_token) throw new Error(data.error ?? 'ACLED OAuth returned no access_token')
  return data as { access_token: string; refresh_token?: string; expires_in?: number }
}

/** Returns a Bearer access token, refreshing from cache when possible. */
export async function getAcledAccessToken(email: string, password: string): Promise<string> {
  const now = Date.now()
  if (cache && now < cache.expiresAt - 60_000) return cache.access

  if (cache?.refresh) {
    try {
      const refreshed = await requestToken(new URLSearchParams({
        refresh_token: cache.refresh,
        grant_type: 'refresh_token',
        client_id: 'acled',
      }))
      cache = {
        access: refreshed.access_token,
        refresh: refreshed.refresh_token ?? cache.refresh,
        expiresAt: now + (refreshed.expires_in ?? 86400) * 1000,
      }
      return cache.access
    } catch { /* fall through to password grant */ }
  }

  const data = await requestToken(new URLSearchParams({
    username: email,
    password,
    grant_type: 'password',
    client_id: 'acled',
    scope: 'authenticated',
  }))
  cache = {
    access: data.access_token,
    refresh: data.refresh_token ?? '',
    expiresAt: now + (data.expires_in ?? 86400) * 1000,
  }
  return cache.access
}

/** Clear cached token (for tests). */
export function clearAcledTokenCache(): void {
  cache = null
}
