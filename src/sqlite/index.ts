// worker.ts
import type { Database, Sqlite3Static } from '@libsql/libsql-wasm-experimental'
import sqlite3InitModule from '@libsql/libsql-wasm-experimental'
import * as Comlink from 'comlink'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient, type Client, type InArgs } from './client-wasm'
import { batchDriver as batchDriverFn, driver as driverFn } from './drivers'
import { runMigrations } from './migrations'
import * as schema from './schema'
import type { DriverQuery, Sqlite3Method } from './types'

let db: Database
let client: Client
let drizzileClient: ReturnType<typeof drizzle>

const {
	promise: clientReady,
	resolve,
	reject
} = Promise.withResolvers<boolean>()

const updateListener = (sqlite3: Sqlite3Static) => {
	const OpNames: Record<number, string> = {
		9: 'DELETE',
		18: 'INSERT',
		23: 'UPDATE'
	}

	sqlite3.capi.sqlite3_update_hook(
		db.pointer!,
		(
			_userCtx: number,
			op: 9 | 18 | 23,
			dbName: string,
			tableName: string,
			rowid: BigInt
		) => {
			const operation = OpNames[op] ?? `UNKNOWN(${op})`

			console.log(`[SQLITE HOOK]`)
			console.log(`→ Operation: ${op} : ${operation}`)
			console.log(`→ DB: ${dbName}`)
			console.log(`→ Table: ${tableName}`)
			console.log(`→ Row ID: ${rowid.toString()}`)
		},
		0 // userCtx (unused)
	)
}

const initClient = async () => {
	try {
		const sqlite3 = await sqlite3InitModule()

		const path = 'file:local.db'
		;[client, db] = createClient({ url: path }, sqlite3)
		await client.execute(`PRAGMA foreign_keys = ON;`)
		await runMigrations(client)
		updateListener(sqlite3)
		drizzileClient = drizzle(client, { schema })

		resolve(true)
	} catch (err) {
		console.error('Worker: Error initializing client:', err)
		reject(false)
	}
}

initClient()

const ping = (s: string) => {
	console.log('Worker: ping received:', s)
	return 'Pong'
}

const run = async (sql: string, params?: any[]) => {
	await clientReady

	return client.execute(sql, params)
}

const batchRun = async (queries: { sql: string; params?: any[] }[]) => {
	await clientReady
	const stmts = queries.map(({ sql, params = [] }) => ({
		sql,
		args: params
	}))

	return client.batch(stmts, 'deferred')
}

const selectMigrations = async () => {
	await clientReady

	return drizzileClient.select().from(schema.migrations).all()
}

const driver = async (
	sql: string,
	params: InArgs = [],
	method: Sqlite3Method = 'all'
) => {
	await clientReady
	return driverFn(client, sql, params, method)
}

const batchDriver = async (queries: DriverQuery[]) => {
	await clientReady
	return batchDriverFn(client, queries)
}

export const api = {
	ping,
	run,
	batchRun,
	selectMigrations,
	driver,
	batchDriver,
	dbFileName() {
		return db.dbFilename()
	},
	clientReady
}

export type Api = Comlink.RemoteObject<typeof api>

Comlink.expose(api, self as any)
