import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export const E2E_PROJECT_ID = 'e2e-test-project'

const now = () => new Date().toISOString()

/** Minimal persisted project for workspace UI tests. */
export function buildProjectStorePayload() {
  const ts = now()
  return {
    state: {
      projects: [
        {
          id: E2E_PROJECT_ID,
          name: 'E2E Test Theater',
          regionName: 'Ukraine',
          regionCenter: [31.5, 49],
          regionZoom: 5,
          countryCodes: ['UA'],
          goalTemplateId: 'armed-conflict',
          researchQuestion: 'What is happening along the frontline?',
          analysisProfile: 'conflict',
          events: [
            {
              id: 'e2e-ev-1',
              title: 'E2E artillery exchange near test sector',
              summary: 'Playwright smoke event — used to verify feed and detail panels.',
              category: 'conflict',
              lat: 48.5,
              lon: 37.5,
              country: 'Ukraine',
              countryCode: 'UA',
              locationPrecision: 'city',
              actors: [],
              sources: [{ name: 'E2E Wire', reliability: 'B', credibility: 3 }],
              sourceCount: 1,
              corroborationCount: 1,
              severity: 8,
              confidence: 0.75,
              dataQualityScore: 0.7,
              timestamp: ts,
              reportedAt: ts,
              analystComments: [],
              rawSource: 'manual',
              projectId: E2E_PROJECT_ID,
              tags: ['e2e', 'saved'],
              flagged: false,
            },
          ],
          deletedEventIds: [],
          plots: [],
          predictionLedger: [],
          forecasts: [],
          analyticalCanvas: { nodes: [], edges: [] },
          connectors: [
            { id: 'gdelt', name: 'GDELT', enabled: true, eventCount: 0 },
            { id: 'reliefweb', name: 'ReliefWeb', enabled: true, eventCount: 0 },
          ],
          formulaWeightOverrides: {},
          incidents: [],
          watchRules: [],
          journal: [],
          hypothesisLog: [],
          eventPaperLinks: [],
          workspaceMode: 'feed',
          briefEvidenceMode: 'blended',
          savedMonitors: [],
          liveLayers: { vessels: false, aviation: false, coverage: 'focused' },
          targeting: {
            scope: 'regional',
            keywords: ['border', 'artillery'],
            watchEntities: ['Ukrainian forces'],
          },
          storage: 'local',
          aiMode: 'cloud',
          createdAt: ts,
          updatedAt: ts,
          lastOpenedAt: ts,
        },
      ],
      activeProjectId: E2E_PROJECT_ID,
    },
    version: 7,
  }
}

/** Inject project store before any page scripts run. */
export async function installProjectSeed(page: Page) {
  const payload = buildProjectStorePayload()
  await page.addInitScript((data) => {
    localStorage.setItem('argus-projects', JSON.stringify(data))
    localStorage.setItem('argus-analysis-engine-v2', 'ai')
    localStorage.setItem('argus-effort-level', 'low')
  }, payload)
}

/** Load home with a seeded project in localStorage. */
export async function seedTestProject(page: Page) {
  await installProjectSeed(page)
  await page.goto('/')
}

/** Open the seeded project (waits for zustand hydration before redirect guard). */
export async function openSeededProject(page: Page) {
  await installProjectSeed(page)
  await page.goto(`/projects/${E2E_PROJECT_ID}`)
  await expect(page.getByRole('navigation', { name: 'Workspace' })).toBeVisible({ timeout: 30_000 })
}

/** Empty watch floor — no projects. */
export async function clearAppStorage(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear()
  })
}
