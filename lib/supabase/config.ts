export function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export const IS_CLOUD_MODE = process.env.NEXT_PUBLIC_MODE === 'cloud'

/** Cloud-only wipe on sign-out, or optional backup when Supabase is configured. */
export function isProjectCloudSyncEnabled(): boolean {
  return IS_CLOUD_MODE || isSupabaseConfigured()
}
