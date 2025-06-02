import fs from 'fs'
import path from 'path'

interface MigrationStatement {
	version: number
	id: string
	sql: string[]
}

export const migrationStatements: MigrationStatement[] = compileTime(() => {
	const migrationsDir = path.resolve(__dirname, '../../drizzle')
	console.log('Loading migrations from:', migrationsDir)
	if (!fs.existsSync(migrationsDir)) {
		throw new Error(`Migrations directory not found: ${migrationsDir}`)
	}
	const files = fs
		.readdirSync(migrationsDir)
		.filter(f => f.endsWith('.sql'))
		.sort()
	return files
		.map(filename => {
			const baseName = path.basename(filename, '.sql')
			const [v, ...nameParts] = baseName.split('_')
			const version = parseInt(v, 10)
			const id = nameParts.join('_')
			const fullPath = path.join(migrationsDir, filename)
			const rawSql = fs.readFileSync(fullPath, 'utf8').trim()

			return {
				version,
				id,
				sql: rawSql
					.split('--> statement-breakpoint')
					.map(s => s.trim())
					.filter(Boolean)
			}
		})
		.sort(
			(a: MigrationStatement, b: MigrationStatement) => a.version - b.version
		)
})
