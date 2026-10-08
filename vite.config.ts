import tailwindcss from '@tailwindcss/vite'
import { realpathSync } from 'node:fs'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
	base: process.env.PAGES_BASE ?? '/',
	plugins: [tailwindcss(), solid()],
	resolve: { alias: { '@sqlite.org/sqlite-wasm': realpathSync('node_modules/@sqlite.org/sqlite-wasm') + '/sqlite-wasm/jswasm/sqlite3-bundler-friendly.mjs' } },
	server: { hmr: !(process.env.SQLITE_BENCH || process.env.SQLITE_VERIFY), fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync('node_modules/@libsql/libsql-wasm-experimental'), realpathSync('node_modules/@sqlite.org/sqlite-wasm')] } },
	worker: { format: 'es' },
	optimizeDeps: {
		exclude: ['@sqlite.org/sqlite-wasm', '@libsql/libsql-wasm-experimental'],
		include: ['solid-js', 'solid-js/store', 'comlink', 'drizzle-orm', 'drizzle-orm/sqlite-proxy', 'drizzle-orm/libsql', 'drizzle-orm/sqlite-core', '@libsql/core/api', '@libsql/core/config', '@libsql/core/util']
	}
})
