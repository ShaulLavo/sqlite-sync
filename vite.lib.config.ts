import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
	base: './',
	publicDir: false,
	resolve: { alias: { '@sqlite.org/sqlite-wasm': resolve('node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3-bundler-friendly.mjs') } },
	worker: { format: 'es' },
	build: {
		outDir: 'dist-lib',
		lib: { entry: { 'sqlite-sync': resolve('src/core/index.ts'), solid: resolve('src/adapters/solid.ts'), drizzle: resolve('src/adapters/drizzle.ts') }, formats: ['es'] },
		rollupOptions: { external: ['solid-js', 'solid-js/store', 'drizzle-orm/sqlite-proxy'] }
	}
})
