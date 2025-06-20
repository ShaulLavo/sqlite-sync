import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/sqlite/schema.ts',
	out: './drizzle',
	dbCredentials: {
		url: 'file:local.db'
	}
})
