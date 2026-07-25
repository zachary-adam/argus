'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IS_CLOUD_MODE, isSupabaseConfigured } from '@/lib/supabase/config'
import { useProjectStore } from '@/stores/projectStore'

const IS_CLOUD = IS_CLOUD_MODE

export interface LocalUser {
  id: string
  email: string
  name?: string
  avatarUrl?: string
}

interface AuthContextType {
  user: LocalUser | null
  isAuthenticated: boolean
  isCloud: boolean
  cloudSyncAvailable: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithGitHub: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null, isAuthenticated: false, isCloud: IS_CLOUD,
  cloudSyncAvailable: isSupabaseConfigured(),
  signIn: async () => ({ error: null }),
  signInWithGitHub: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null)

  useEffect(() => {
    if (IS_CLOUD || isSupabaseConfigured()) {
      const supabase = createClient()
      if (!supabase) return

      supabase.auth.getSession().then(({ data }: { data: { session: { user: { id: string; email?: string; user_metadata?: Record<string, string> } } | null } }) => {
        if (data.session?.user) setUser(supabaseUserToLocal(data.session.user))
      })

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: unknown, session: { user: { id: string; email?: string; user_metadata?: Record<string, string> } } | null) => {
        setUser(session?.user ? supabaseUserToLocal(session.user) : null)
      })
      return () => subscription.unsubscribe()
    }

    if (!IS_CLOUD) {
      fetch('/api/auth/me').then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.user) setUser(d.user) })
        .catch(() => {})
    }
  }, [])

  const signIn = async (_email: string, password: string) => {
    if (IS_CLOUD) return { error: 'Use GitHub sign-in in cloud mode' }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const d = await res.json()
        return { error: d.error ?? 'Login failed' }
      }
      const d = await res.json()
      setUser(d.user)
      return { error: null }
    } catch {
      return { error: 'Network error' }
    }
  }

  const signInWithGitHub = async () => {
    const supabase = createClient()
    if (!supabase) return
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'read:user user:email',
      },
    })
  }

  const signOut = async () => {
    if (IS_CLOUD && useProjectStore.getState().projects.length > 0) {
      const ok = window.confirm(
        'Sign out? Your projects remain in your cloud account. This device will clear its local copy until you sign in again.',
      )
      if (!ok) return
    }
    if (IS_CLOUD || isSupabaseConfigured()) {
      const supabase = createClient()
      if (supabase) await supabase.auth.signOut()
    }
    if (!IS_CLOUD) {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    }
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isCloud: IS_CLOUD,
      cloudSyncAvailable: isSupabaseConfigured(),
      signIn,
      signInWithGitHub,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

function supabaseUserToLocal(u: { id: string; email?: string; user_metadata?: Record<string, string> }): LocalUser {
  return {
    id: u.id,
    email: u.email ?? '',
    name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.user_metadata?.user_name,
    avatarUrl: u.user_metadata?.avatar_url,
  }
}
