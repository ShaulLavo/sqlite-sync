import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: './tests/browser',
	timeout: 60_000,
	fullyParallel: false,
	workers: 1,
	outputDir: './test-results',
	use: {
		baseURL: 'http://127.0.0.1:5178',
		headless: true,
		launchOptions: process.env.CHROMIUM_PATH
			? { executablePath: process.env.CHROMIUM_PATH }
			: {},
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'SQLITE_VERIFY=1 bun run dev --host 127.0.0.1 --port 5178 --strictPort',
		url: 'http://127.0.0.1:5178',
		reuseExistingServer: !process.env.CI
	}
})
