import { test, expect } from '@playwright/test'
import { openSeededProject } from './helpers/seed'

test.describe('Workspace', () => {
  test.beforeEach(async ({ page }) => {
    await openSeededProject(page)
  })

  test('shows project header and workbench tabs', async ({ page }) => {
    await expect(page.locator('.ui-header-workspace__title')).toHaveText('E2E Test Theater')
    const nav = page.getByRole('navigation', { name: 'Workspace' })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Map', exact: true })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Events', exact: true })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Research', exact: true })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Canvas', exact: true })).toBeVisible()
  })

  test('opens Events feed with seeded event', async ({ page }) => {
    await page.getByRole('button', { name: 'Events' }).click()
    await expect(page.getByText('E2E artillery exchange near test sector')).toBeVisible({ timeout: 30_000 })
  })

  test('opens Settings from project menu', async ({ page }) => {
    await page.getByRole('button', { name: 'Project menu' }).click()
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.getByText('Your workspace')).toBeVisible()
    await page.locator('.ui-panel-tabs').getByRole('button', { name: 'Pro', exact: true }).click()
    await expect(page.getByText('AI-assisted — Cloud')).toBeVisible()
  })

  test('opens Settings with keyboard shortcut', async ({ page }) => {
    await page.locator('.ui-header-workspace__title').click()
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${mod}+,`)
    await expect(page.getByText('Your workspace')).toBeVisible()
  })

  test('opens Ledger from project menu', async ({ page }) => {
    await page.getByRole('button', { name: 'Project menu' }).click()
    await page.getByRole('button', { name: 'Ledger' }).click()
    await expect(page.getByText('Prediction Ledger')).toBeVisible()
    await expect(page.getByText('No predictions recorded')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open canvas' })).toBeVisible()
  })

  test('focuses map query bar with keyboard shortcut', async ({ page }) => {
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.keyboard.press(`${mod}+k`)
    await expect(page.getByLabel('Search events on map')).toBeFocused()
  })
})

test.describe('Event detail', () => {
  test.beforeEach(async ({ page }) => {
    await openSeededProject(page)
    await page.getByRole('button', { name: 'Events' }).click()
    await expect(page.getByText('E2E artillery exchange near test sector')).toBeVisible({ timeout: 30_000 })
    await page.getByText('E2E artillery exchange near test sector').click()
  })

  test('shows Open article and Cross-check actions', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Open article' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cross-check' })).toBeVisible()
  })
})
