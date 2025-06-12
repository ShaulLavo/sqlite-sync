import fs from 'fs'
import path from 'path'

interface MigrationStatement {
	version: number
	id: string
	sql: string[]
}

interface MigrationFile {
	filename: string
	version: number
	id: string
	fullPath: string
}

function readMigrationFiles(migrationsDir: string): MigrationFile[] {
	if (!fs.existsSync(migrationsDir)) {
		throw new Error(`Migrations directory not found: ${migrationsDir}`)
	}

	const files = fs
		.readdirSync(migrationsDir)
		.filter((f: string) => f.endsWith('.sql'))
		.sort()

	return files.map((filename: string): MigrationFile => {
		const baseName = path.basename(filename, '.sql')
		const [v, ...nameParts] = baseName.split('_')
		const version = parseInt(v, 10)
		const id = nameParts.join('_')
		const fullPath = path.join(migrationsDir, filename)

		return {
			filename,
			version,
			id,
			fullPath
		}
	})
}

function parseMigrationFile(migrationFile: MigrationFile): MigrationStatement {
	const rawSql = fs.readFileSync(migrationFile.fullPath, 'utf8').trim()

	return {
		version: migrationFile.version,
		id: migrationFile.id,
		sql: rawSql
			.split('--> statement-breakpoint')
			.map((s: string) => s.trim())
			.filter(Boolean)
	}
}

function generateMigrationsData(): void {
	const migrationsDir = path.resolve('./drizzle')

	console.log(`📂 Reading migrations from: ${migrationsDir}`)

	const migrationFiles = readMigrationFiles(migrationsDir)
	console.log(`📄 Found ${migrationFiles.length} migration files`)

	const migrations: MigrationStatement[] = migrationFiles
		.map(parseMigrationFile)
		.sort(
			(a: MigrationStatement, b: MigrationStatement) => a.version - b.version
		)

	const output = /* ts */ `
	export interface MigrationStatement {
		version: number
		id: string
		sql: string[]
	}

	export const migrationStatements: MigrationStatement[] = ${JSON.stringify(
		migrations,
		null,
		2
	)} 
`

	const outputPath = './src/consts/migrations.ts'
	fs.writeFileSync(outputPath, output)

	console.log(`✅ Generated ${outputPath}`)
	console.log(
		`📊 Processed ${migrations.length} migrations (versions ${
			migrations[0]?.version ?? 'N/A'
		} - ${migrations[migrations.length - 1]?.version ?? 'N/A'})`
	)
}

// Run the script
try {
	generateMigrationsData()
} catch (error) {
	console.error('❌ Error generating migrations data:', error)
	process.exit(1)
}
