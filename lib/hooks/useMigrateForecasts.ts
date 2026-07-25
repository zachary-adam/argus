'use client'
import { useEffect } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { migrateForecastsToProjects, readLegacyForecasts } from '@/lib/migrateForecasts'

const MIGRATED_KEY = 'argus_forecasts_migrated_v1'

export function useMigrateForecasts() {
  useEffect(() => {
    try {
      if (localStorage.getItem(MIGRATED_KEY)) return
      const legacy = readLegacyForecasts()
      if (!legacy.length) {
        localStorage.setItem(MIGRATED_KEY, '1')
        return
      }
      const { projects } = useProjectStore.getState()
      const merged = migrateForecastsToProjects(projects, legacy)
      useProjectStore.setState({ projects: merged })
      localStorage.setItem(MIGRATED_KEY, '1')
      localStorage.removeItem('argus-forecasts')
    } catch { /* noop */ }
  }, [])
}
