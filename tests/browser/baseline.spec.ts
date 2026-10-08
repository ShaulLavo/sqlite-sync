import { test, expect } from '@playwright/test'

test('capture legacy ordering before changes', async ({ page }) => {
	await page.goto('/tests/browser/index.html')
	const result = await page.evaluate(async () => {
		// Vite serves the TypeScript harness directly.
		const { baseline } = await import('/tests/browser/baseline.ts')
		return baseline()
	})
	console.log(JSON.stringify(result))
	expect(result.events).toEqual(['DELETE', 'UPDATE', 'INSERT'])
})
