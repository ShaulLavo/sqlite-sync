import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/demo/schema.ts',
	out: './drizzle',
	dbCredentials: {
		url: 'file:local.db'
	}
})
