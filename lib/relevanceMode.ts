import { useSettingsStore } from '@/stores/settingsStore'

/** Semantic AI relevance filter for the live feed (falls back to keywords when keys are missing). */
export function getDeepRelevanceFilter(): boolean {
  return useSettingsStore.getState().deepRelevanceFilter
}

export function useDeepRelevanceFilter(): boolean {
  return useSettingsStore(s => s.deepRelevanceFilter)
}
