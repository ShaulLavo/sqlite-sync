import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import topLevelAwait from 'vite-plugin-top-level-await'
import worker from 'vite-plugin-worker'

export default defineConfig({
	plugins: [tailwindcss(), topLevelAwait(), worker({}), solid()],
	optimizeDeps: {
		exclude: ['@sqlite.org/sqlite-wasm', '@libsql/libsql-wasm-experimental']
	},
	server: {
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp'
		}
	}
})
