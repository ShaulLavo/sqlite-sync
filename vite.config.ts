import tailwindcss from '@tailwindcss/vite'
import { realpathSync } from 'node:fs'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import solid from 'vite-plugin-solid'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineConfig({
	plugins: [tailwindcss(), topLevelAwait(), solid()],
	server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync('node_modules/@libsql/libsql-wasm-experimental')] } },
	worker: { format: 'es' },
	optimizeDeps: {
		exclude: ['@sqlite.org/sqlite-wasm', '@libsql/libsql-wasm-experimental']
	}
	// server: {
	// 	headers: {
	// 		'Cross-Origin-Opener-Policy': 'same-origin',
	// 		'Cross-Origin-Embedder-Policy': 'require-corp'
	// 	}
	// }
})
