import { test, expect } from '@playwright/test'
import { clearAppStorage, seedTestProject } from './helpers/seed'

test.describe('Watch floor', () => {
  test.beforeEach(async ({ page }) => {
    await clearAppStorage(page)
  })

  test('lists seeded project on home', async ({ page }) => {
    await seedTestProject(page)
    await expect(page.getByRole('heading', { name: 'Your watch floor' })).toBeVisible()
    await expect(page.locator('.sit-row').filter({ hasText: 'E2E Test Theater' })).toBeVisible()
    await expect(page.getByText(/1 theater monitored/i)).toBeVisible()
  })
})
