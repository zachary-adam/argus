import { test, expect } from '@playwright/test'
import { clearAppStorage } from './helpers/seed'

test.describe('Home', () => {
  test.beforeEach(async ({ page }) => {
    await clearAppStorage(page)
  })

  test('loads welcome screen', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Welcome to ARGUS' })).toBeVisible()
    await expect(page.getByText('Scope a region, wire in your sources')).toBeVisible()
  })

  test('navigates to new project wizard', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Scope a new region/i }).click()
    await expect(page).toHaveURL(/\/projects\/new/)
    await expect(page.getByRole('heading', { name: 'Name your project' })).toBeVisible()
  })
})
