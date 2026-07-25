import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// User's BYOK AI keys — stored in browser localStorage only.
// Never sent to any server except as the apiKey field in request bodies.
// If the user clears their browser, they re-enter them.
interface SettingsStore {
  anthropicKey: string
  openaiKey: string
  preferredAiProvider: 'claude' | 'openai'
  /** When true, live feed uses semantic AI relevance; keyword rules remain as fallback. */
  deepRelevanceFilter: boolean
  /** When false, pattern scans, alerts, and brief pattern notes are disabled. */
  patternsEnabled: boolean
  /** Unlock analyst-grade panels (velocity, ledger, incidents, etc.). */
  proMode: boolean
  setAnthropicKey: (key: string) => void
  setOpenaiKey: (key: string) => void
  setPreferredProvider: (p: 'claude' | 'openai') => void
  setDeepRelevanceFilter: (on: boolean) => void
  setPatternsEnabled: (on: boolean) => void
  setProMode: (on: boolean) => void
  clearKeys: () => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      anthropicKey: '',
      openaiKey: '',
      preferredAiProvider: 'claude',
      // Keyword rules by default — deep AI filter is opt-in (heavy on weak machines).
      deepRelevanceFilter: false,
      patternsEnabled: false,
      proMode: false,
      setAnthropicKey: (key) => set({ anthropicKey: key }),
      setOpenaiKey: (key) => set({ openaiKey: key }),
      setPreferredProvider: (p) => set({ preferredAiProvider: p }),
      setDeepRelevanceFilter: (on) => set({ deepRelevanceFilter: on }),
      setPatternsEnabled: (on) => set({ patternsEnabled: on }),
      setProMode: (on) => set({ proMode: on }),
      clearKeys: () => set({ anthropicKey: '', openaiKey: '' }),
    }),
    {
      name: 'argus-settings',
      version: 2,
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Partial<SettingsStore>
        // v2: default deep relevance off for smoother feed on typical laptops.
        if (version < 2 && s.deepRelevanceFilter === undefined) {
          s.deepRelevanceFilter = false
        }
        if (version < 2 && s.deepRelevanceFilter === true) {
          // Existing installs that never opted in intentionally still get the lighter default.
          s.deepRelevanceFilter = false
        }
        return s as SettingsStore
      },
      partialize: (s) => ({
        anthropicKey: s.anthropicKey,
        openaiKey: s.openaiKey,
        preferredAiProvider: s.preferredAiProvider,
        deepRelevanceFilter: s.deepRelevanceFilter,
        patternsEnabled: s.patternsEnabled,
        proMode: s.proMode,
      }),
    }
  )
)

// Helper used by API call sites — returns the key to send as apiKey in request body
export function getAiKey(provider: 'claude' | 'openai'): string {
  const s = useSettingsStore.getState()
  return provider === 'claude' ? s.anthropicKey : s.openaiKey
}
