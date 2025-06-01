import * as Comlink from 'comlink'
import { createClient, type Client } from './utils/client-wasm'
import sqlite3InitModule from '@libsql/libsql-wasm-experimental'
import { migrationStatements } from './consts/miagration'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'
let c: Client | null = null
let db: ReturnType<typeof drizzle> | null = null

const {
	promise: clientReady,
	resolve,
	reject
} = Promise.withResolvers<boolean>()

const runMigrations = async (c: Client) => {
	for (const batch of migrationStatements) {
		const { rows } = await c.execute(
			`SELECT 1 FROM migrations WHERE name = ?;`,
			[batch.id]
		)
		if (rows.length > 0) {
			continue
		}

		for (const stmt of batch.sql) {
			await c.execute(stmt)
		}

		await c.execute(`INSERT INTO migrations(name) VALUES (?);`, [batch.id])
	}
}

const initClient = async () => {
	try {
		const sqlite3 = await sqlite3InitModule()
		c = createClient({ url: 'file:local.db' }, sqlite3)
		await c.execute(`PRAGMA foreign_keys = ON;`)
		await runMigrations(c)

		db = drizzle(c, { schema })

		resolve(true)
	} catch (err) {
		console.error('Worker: Error initializing client:', err)
		reject(false)
	}
}

initClient()

function ping() {
	console.log('Worker: ping() was called')
	return 'Worker replied'
}

const run = async (sql: string, params?: any[]) => {
	await clientReady
	return c!.execute(sql, params)
}

const batchRun = async (
	queries: { sql: string; params?: any[]; method: string }[]
) => {
	await clientReady

	const stmts = queries.map(({ sql, params = [] }) => ({
		sql,
		args: params
	}))

	const results = await c!.batch(stmts, 'deferred')
	return results
}

const selectMigrations = async () => {
	await clientReady
	const migrations = await db!.select().from(schema.migrations).all() // typed, safe
	return migrations
}

const api = {
	ping,
	run,
	batchRun,
	clientReady,
	selectMigrations
}

Comlink.expose(api)
export type Api = Comlink.RemoteObject<typeof api>
