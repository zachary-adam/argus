import { test, expect } from '@playwright/test'
import { clearAppStorage } from './helpers/seed'

test.describe('Project wizard', () => {
  test.beforeEach(async ({ page }) => {
    await clearAppStorage(page)
    await page.goto('/projects/new')
  })

  test('creates a project through all steps', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Name your project' })).toBeVisible()

    await page.getByPlaceholder(/Sahel Conflict Watch/i).fill('Playwright E2E Theater')
    await page.locator('.wizard-next-btn').click()

    await expect(page.getByRole('heading', { name: 'Define the region scope' })).toBeVisible()
    await page.getByRole('button', { name: 'Select regions or countries' }).click()
    await page.getByPlaceholder(/Search regions or countries/i).fill('Ukraine')
    await page.getByRole('checkbox', { name: 'Ukraine' }).click()
    await expect(page.locator('main').getByText('1 countries', { exact: true })).toBeVisible()
    // Close region picker so it does not intercept the Next click.
    await page.getByRole('heading', { name: 'Define the region scope' }).click()
    await expect(page.locator('main .wizard-next-btn')).toBeEnabled()
    await page.locator('main .wizard-next-btn').click()

    await expect(page.getByRole('heading', { name: 'What are you watching?' })).toBeVisible()
    await page.getByPlaceholder(/Write your research question/i).fill('What is the frontline situation in Ukraine?')
    await page.getByRole('button', { name: 'Create project' }).click()

    await expect(page).toHaveURL(/\/projects\/proj_/)
    await expect(page.locator('.ui-header-workspace__title')).toHaveText('Playwright E2E Theater')
  })
})
