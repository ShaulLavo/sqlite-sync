import type { Client } from './client-wasm'
import { migrationStatements } from '../consts/migrations'

export async function runMigrations(c: Client): Promise<void> {
	const { rows: tblRows } = await c.execute(
		`SELECT name FROM sqlite_master WHERE type='table' AND name='migrations';`
	)
	const hasMigrationsTable = tblRows.length > 0

	const baseBatch = migrationStatements.find(b => b.version === 0)
	if (!baseBatch) throw new Error(`Missing base (version 0) migration`)

	if (!hasMigrationsTable) {
		const baseStmts = baseBatch.sql.map(sql => ({ sql, args: [] }))
		await c.batch(baseStmts, 'deferred')
		await c.execute(`INSERT INTO migrations(name) VALUES (?);`, [baseBatch.id])
	} else {
		const alreadyLogged = await c.execute(
			`SELECT 1 FROM migrations WHERE name = ?;`,
			[baseBatch.id]
		)
		if (!alreadyLogged.rows.length) {
			await c.execute(`INSERT INTO migrations(name) VALUES (?);`, [
				baseBatch.id
			])
		}
	}

	for (const batch of migrationStatements) {
		if (batch.version === 0) continue

		const { rows } = await c.execute(
			`SELECT 1 FROM migrations WHERE name = ?;`,
			[batch.id]
		)
		if (rows.length) continue

		const stmts = batch.sql.map(sql => ({ sql, args: [] }))
		await c.batch(stmts, 'deferred')
		await c.execute(`INSERT INTO migrations(name) VALUES (?);`, [batch.id])
	}
}
