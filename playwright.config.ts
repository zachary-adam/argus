import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3001)
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`
const isCi = !!process.env.CI

// Pure-local client bundle — avoids SupabaseSyncProvider wiping argus-projects in cloud mode.
const e2ePublicEnv = [
  'NEXT_PUBLIC_MODE=local',
  'NEXT_PUBLIC_SUPABASE_URL=',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY=',
  'NEXT_PUBLIC_DEMO_PROJECTS=false',
].join(' ')

const e2eEnv = {
  ARGUS_DEV_OPEN: 'true',
  NEXT_PUBLIC_MODE: 'local',
  NEXT_PUBLIC_SUPABASE_URL: '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
  NEXT_PUBLIC_DEMO_PROJECTS: 'false',
} as const

// CI: production build + start (stable, no HMR). Local: dev server (faster iteration).
const webServerCommand = isCi
  ? `${e2ePublicEnv} npm run build && ${e2ePublicEnv} npm run start -- -p ${PORT}`
  : `${e2ePublicEnv} ARGUS_DEV_OPEN=true npm run dev -- -p ${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !!process.env.PLAYWRIGHT_REUSE_SERVER,
    timeout: isCi ? 300_000 : 120_000,
    env: { ...process.env, ...e2eEnv },
  },
})
