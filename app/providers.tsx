'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth/AuthContext'
import { SupabaseSyncProvider } from '@/lib/supabase/SupabaseSyncProvider'
import { CloudSchemaBanner } from '@/components/CloudSchemaBanner'
import { SetupKeysModal } from '@/components/SetupKeysModal'
import { useMapStore } from '@/stores/mapStore'
import { useEffect, useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60000, retry: 1 } },
  }))
  useEffect(() => { useMapStore.persist.rehydrate() }, [])
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SupabaseSyncProvider>
          <CloudSchemaBanner />
          <SetupKeysModal />
          {children}
        </SupabaseSyncProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
