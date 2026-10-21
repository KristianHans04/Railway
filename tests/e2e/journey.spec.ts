import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const projectId = '11111111-1111-4111-8111-111111111111'
const environmentId = '22222222-2222-4222-8222-222222222222'
const serviceId = '33333333-3333-4333-8333-333333333333'
const deploymentId = '44444444-4444-4444-8444-444444444444'

test('connect, launch, inspect logs, stop and delete', async ({ page }) => {
  const consoleErrors: string[] = []
  const mutationPaths: string[] = []
  page.on('console', entry => { if (entry.type() === 'error') consoleErrors.push(entry.text()) })
  let connected = false
  let created = false
  let status = 'QUEUED'
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const method = route.request().method()
    if (method === 'POST') mutationPaths.push(path)
    let body: unknown = {}
    if (path === '/api/session') body = connected ? { connected: true, type: 'project', projectId, environmentId } : { connected: false }
    else if (path === '/api/connect') { connected = true; body = { connected: true, type: 'project', projectId, environmentId } }
    else if (path === '/api/projects') body = { projects: [{ id: projectId, name: 'Demo project' }] }
    else if (path === `/api/projects/${projectId}`) body = { project: { id: projectId, name: 'Demo project', environments: [{ id: environmentId, name: 'production' }], services: created ? [{ id: serviceId, name: 'web-preview' }] : [] } }
    else if (path === '/api/services' && method === 'POST') { created = true; body = { service: { id: serviceId, name: 'web-preview' }, image: 'nginx:stable-alpine', projectId, environmentId } }
    else if (path.endsWith('/deployments')) body = { deployments: created ? [{ id: deploymentId, status, createdAt: '2026-01-01T00:00:00Z' }] : [] }
    else if (path.endsWith('/logs')) body = { lines: [{ timestamp: '2026-01-01T00:00:00Z', message: 'Container started', severity: 'info' }] }
    else if (path.endsWith('/stop')) { status = 'REMOVED'; body = { accepted: true } }
    else if (path.endsWith('/delete')) { created = false; body = { deleted: true } }
    else if (path.includes('/deployments/')) body = { deployment: { id: deploymentId, status, createdAt: '2026-01-01T00:00:00Z' } }
    await route.fulfill({ status: path === '/api/services' && method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Connect Railway' })).toBeVisible()
  await page.getByLabel('Railway token').fill('test-token-for-browser-flow')
  await page.getByRole('button', { name: 'Connect Railway', exact: true }).click()
  await expect(page.getByText('Railway connected')).toBeVisible()
  await page.getByLabel('Public container image').fill('nginx:stable-alpine')
  await page.getByLabel('Service name').fill('web-preview')
  await page.getByRole('button', { name: 'Launch container' }).click()
  await expect(page.getByRole('heading', { name: 'web-preview' })).toBeVisible()
  await expect(page.getByText('Queued', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Container started')).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => JSON.stringify({ local: localStorage, session: sessionStorage }))).not.toContain('test-token-for-browser-flow')
  await page.screenshot({ path: 'docs/screenshots/deployment-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'docs/screenshots/deployment-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Dark theme' }).click()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.screenshot({ path: 'docs/screenshots/deployment-dark-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Light theme' }).click()
  await page.getByRole('button', { name: 'Configure container' }).click()
  await expect(page.getByRole('dialog', { name: 'Container controls' })).toBeVisible()
  await expect(page.getByLabel('Public container image')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Container controls' })).toBeHidden()
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 850 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `test-results/review-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1280, height: 850 })
  status = 'SUCCESS'
  await page.getByRole('button', { name: 'Refresh state' }).click()
  await expect(page.getByRole('button', { name: 'Stop deployment' })).toBeVisible()
  await page.screenshot({ path: 'docs/screenshots/deployment-running-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'docs/screenshots/deployment-running-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Stop deployment' }).click()
  await expect(page.getByText('Stopped', { exact: true }).first()).toBeVisible()
  await page.locator('summary').filter({ hasText: 'Delete service' }).click()
  await page.getByLabel('Type the exact service name').fill('web-preview')
  await page.getByRole('button', { name: 'Delete service', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No deployment selected' })).toBeVisible()
  expect(mutationPaths.filter(path => path === '/api/services')).toHaveLength(1)
  expect(consoleErrors).toEqual([])
})

test('narrow viewport keeps workspace within page width', async ({ page }) => {
  await page.route('**/api/session', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ connected: false }) }))
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Connect Railway' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    if (width === 390 || width === 1440) await page.screenshot({ path: `docs/screenshots/connection-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 850 })
  await page.getByRole('button', { name: 'Dark theme' }).click()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.screenshot({ path: 'docs/screenshots/connection-dark-mobile.png', fullPage: true })
})
