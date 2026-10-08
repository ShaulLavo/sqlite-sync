import { test, expect } from '@playwright/test'

test('demo steps Life in SQLite, persists it, and keeps SQL results live', async ({ page }) => {
	const errors: string[] = []
	page.on('pageerror', error => errors.push(error.message))
	await page.goto('/')
	await expect(page.getByText('SQLite ready', { exact: true })).toBeVisible()
	const generation = page.getByTestId('generation')
	await page.getByRole('button', { name: 'Clear', exact: true }).click()
	await expect(generation).toHaveText('0')
	await page.getByRole('button', { name: 'Glider guns', exact: true }).click()
	await page.getByRole('button', { name: 'Step', exact: true }).click()
	await expect(generation).toHaveText('1')
	await page.reload()
	await expect(generation).toHaveText('1')

	const live = page.locator('.results tbody')
	await page.getByRole('button', { name: 'Population', exact: true }).click()
	await expect(live.locator('td').first()).toHaveText('1')
	await page.getByRole('button', { name: 'Step', exact: true }).click()
	await expect(generation).toHaveText('2')
	await expect(live.locator('td').first()).toHaveText('2')

	await page.getByRole('button', { name: 'Run', exact: true }).first().click()
	await expect.poll(async () => Number(await generation.textContent())).toBeGreaterThan(4)
	await page.getByRole('button', { name: 'Pause', exact: true }).click()
	await expect(page.locator('.stream')).toContainText('cells')
	await expect(page.locator('.subs li')).not.toHaveCount(0)

	await page.getByRole('button', { name: 'Add a user', exact: true }).click()
	await expect(page.getByRole('status')).toContainText('1 row affected')
	await page.getByRole('button', { name: 'Users', exact: true }).click()
	await expect(live).toContainText('Grace Hopper')

	const download = page.waitForEvent('download')
	await page.getByRole('button', { name: 'Download .db' }).click()
	expect((await download).suggestedFilename()).toBe('sqlite-sync.db')
	expect(errors).toEqual([])
	await page.screenshot({ path: 'test-results/demo-desktop.png', fullPage: true })
})

test('mobile layout is usable with reduced motion', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto('/')
	await expect(page.getByRole('button', { name: 'Step', exact: true })).toBeVisible()
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
	await page.screenshot({ path: 'test-results/demo-mobile.png', fullPage: true })
})
