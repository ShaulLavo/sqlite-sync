import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
	optimizeDeps: {
		exclude: ['@sqlite.org/sqlite-wasm', '@libsql/libsql-wasm-experimental']
	},
	test: {
		browser: {
			enabled: true,
			provider: 'playwright',

			instances: [
				{
					browser: 'chromium',
					headless: false
				}
			]
		},
		include: ['src/**/*.{test,unit}.ts', 'src/**/*.browser.{test,spec}.ts']
	}
})
