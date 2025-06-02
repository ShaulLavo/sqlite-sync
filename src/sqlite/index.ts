import type {
	Database,
	Sqlite3Static,
	WasmPointer
} from '@libsql/libsql-wasm-experimental'
import sqlite3InitModule from '@libsql/libsql-wasm-experimental'
import * as Comlink from 'comlink'
import { desc, gte, gt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { generateTriggersForTable } from '../utils/triggers'
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
type UpdateEvent = {
	operation: 'INSERT' | 'UPDATE' | 'DELETE'
	dbName: string
	tableName: string
	rowid: BigInt
}
export type ChangeCallback = (change: schema.ChangeLog) => void
type TableName = keyof typeof schema
type PrimaryKey = string
const subscribers = new Map<TableName, Map<PrimaryKey, Set<ChangeCallback>>>()
let logCursor = 0

const cache = [] as schema.ChangeLog[]

/**
 * Subscribe to change events for a given table + primary key.
 * @param tableName  Name of the table you're interested in.
 * @param primaryKey  An object representing the PK fields (e.g. { id: 42 }).
 * @param callback  Invoked whenever a matching change fires.
 */
function subscribeToChange(
	tableName: TableName,
	primaryKey: Record<string, unknown>,
	callback: ChangeCallback
) {
	const pkString = JSON.stringify(primaryKey)
	let tableMap = subscribers.get(tableName)
	if (!tableMap) {
		tableMap = new Map()
		subscribers.set(tableName, tableMap)
	}

	let cbSet = tableMap.get(pkString)
	if (!cbSet) {
		cbSet = new Set()
		tableMap.set(pkString, cbSet)
	}

	cbSet.add(callback)
	return Comlink.proxy(() => {
		unsubscribeFromChange(tableName, primaryKey, callback)
	})
}

/**
 * Unsubscribe a callback from future notifications for a given table + primary key.
 * @param tableName  The table you previously subscribed to.
 * @param primaryKey  The exact same PK object you used when subscribing.
 * @param callback  The function you passed in originally.
 */
function unsubscribeFromChange(
	tableName: TableName,
	primaryKey: Record<string, unknown>,
	callback: ChangeCallback
) {
	const pkString = JSON.stringify(primaryKey)
	const tableMap = subscribers.get(tableName)
	if (!tableMap) return

	const cbSet = tableMap.get(pkString)
	if (!cbSet) return

	cbSet.delete(callback)
	if (cbSet.size === 0) {
		tableMap.delete(pkString)
	}
	if (tableMap.size === 0) {
		subscribers.delete(tableName)
	}
}
/**
 * Subscribe to all changes in a given table (regardless of PK).
 */
function subscribeToAllChangesInTable(
	tableName: TableName,
	callback: ChangeCallback
) {
	let tableMap = subscribers.get(tableName)
	if (!tableMap) {
		tableMap = new Map()
		subscribers.set(tableName, tableMap)
	}

	const wildcardKey = '*'
	let cbSet = tableMap.get(wildcardKey)
	if (!cbSet) {
		cbSet = new Set()
		tableMap.set(wildcardKey, cbSet)
	}
	cbSet.add(callback)
	return Comlink.proxy(() => {
		unsubscribeFromAllChangesInTable(tableName, callback)
	})
}
/**
 * Unsubscribe a “listen to all in this table” callback.
 */
function unsubscribeFromAllChangesInTable(
	tableName: TableName,
	callback: ChangeCallback
) {
	const tableMap = subscribers.get(tableName)
	if (!tableMap) return

	const wildcardKey = '*'
	const cbSet = tableMap.get(wildcardKey)
	if (!cbSet) return

	cbSet.delete(callback)
	if (cbSet.size === 0) {
		tableMap.delete(wildcardKey)
	}
	if (tableMap.size === 0) {
		subscribers.delete(tableName)
	}
}
/**
 * Dispatch a change event only to callbacks subscribed to this table + PK.
 */
function dispatchChangeNotification(change: schema.ChangeLog) {
	const tableMap = subscribers.get(change.tbl_name as TableName)
	if (!tableMap) return

	const wildcardKey = '*'
	const allSet = tableMap.get(wildcardKey)
	if (allSet) {
		for (const cb of allSet) {
			try {
				cb(change)
			} catch (err) {
				console.error('[Change Dispatch Error]', err)
			}
		}
	}

	// Now notify the callbacks subscribed to the exact PK:
	const pkString = change.pk_json
	const pkSet = tableMap.get(pkString)
	if (!pkSet) return

	for (const cb of pkSet) {
		try {
			cb(change)
		} catch (err) {
			console.error('[Change Dispatch Error]', err)
		}
	}
}
/**
 * Sets up SQLite hooks to record every INSERT/UPDATE/DELETE,
 * then on transaction commit, fetches detailed rows from the change_log,
 * pushes them to a local ledger, and dispatches only to subscribers.
 */
const setupChangeNotificationSystem = (sqlite3: Sqlite3Static) => {
	const changeLogBuffer: Array<{
		operation: 'INSERT' | 'UPDATE' | 'DELETE'
		dbName: string
		tableName: string
		rowid: BigInt
	}> = []

	const OpNames: Record<number, 'DELETE' | 'INSERT' | 'UPDATE'> = {
		9: 'DELETE',
		18: 'INSERT',
		23: 'UPDATE'
	}

	// Listen to every row‐level change
	sqlite3.capi.sqlite3_update_hook(
		db.pointer! as WasmPointer,
		(
			_userCtx: number,
			op: 9 | 18 | 23,
			dbName: string,
			tableName: string,
			rowid: BigInt
		) => {
			changeLogBuffer.push({
				operation: OpNames[op],
				dbName,
				tableName,
				rowid
			})
		},
		0 as WasmPointer
	)

	// On commit, read the persisted change_log rows, update ledger, and notify
	sqlite3.capi.sqlite3_commit_hook(
		db.pointer! as WasmPointer,
		(_cbArg: WasmPointer) => {
			if (changeLogBuffer.length === 0) {
				console.log('[SQLITE COMMIT HOOK] No changes in this transaction.')
			} else {
				for (const rec of changeLogBuffer) {
					console.log(
						`→ ${rec.operation} on ${rec.dbName}.${
							rec.tableName
						} (rowid=${rec.rowid.toString()})`
					)
				}

				// Fetch the rows that were just written into change_log
				getChangeLogsAtCursor(logCursor).then(({ rows }) => {
					console.log({ l: rows.length, lastSeenId: logCursor })
					if (rows.length === 0) return
					logCursor = rows.length
					cache.push(...rows)
					for (const rec of rows) {
						dispatchChangeNotification(rec)
					}
				})
			}

			changeLogBuffer.length = 0
			return 0
		},
		0 as WasmPointer
	)
}

const initClient = async () => {
	try {
		const sqlite3 = await sqlite3InitModule()

		const path = 'file:local.db'
		;[client, db] = createClient({ url: path }, sqlite3)
		await client.execute(`PRAGMA foreign_keys = ON;`)
		await runMigrations(client)
		const res = await client.execute(
			`SELECT name FROM sqlite_master WHERE type='table';`
		)
		const triggers = res.rows
			.map(row => row.name as string)
			.filter(n => !n.includes('sqlite_') && n !== 'change_log')
			.map(n => generateTriggersForTable(client, n))
		await Promise.all(triggers)
		setupChangeNotificationSystem(sqlite3) // run this after DB is initialized
		drizzileClient = drizzle(client, { schema })

		resolve(true)
	} catch (err) {
		console.error('Worker: Error initializing client:', err)
		reject(false)
	}
}
const onClientReady = async () => {
	const { rows } = await getChangeLogsAtCursor(0)
	cache.length = 0
	cache.push(...rows)
	logCursor = rows.length
	console.log('Worker: Client is ready!')
}

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
const selectMigrations = async () => {
	await clientReady

	return drizzileClient.select().from(schema.migrations).all()
}

const getChangeLogsAtCursor = async (lastSeenLogId: number) => {
	await clientReady

	// Assuming your change_log schema has an auto‐increment “id” column:

	const rows = await drizzileClient
		.select()
		.from(schema.changeLog)
		.where(gt(schema.changeLog.id, lastSeenLogId))
		.orderBy(desc(schema.changeLog.id))
		.all()
	if (rows.length > 0) {
		console.log(
			`Worker: Found ${rows.length} new change logs since last seen ID ${lastSeenLogId}`
		)
	}
	return { rows }
}

const api = (cb: () => any) => {
	console.log('Worker: API called')
	return cb()
}
api.ping = ping
api.run = run
api.batchRun = batchRun
api.selectMigrations = selectMigrations
api.driver = driver
api.batchDriver = batchDriver
api.dbFileName = () => db.dbFilename()
api.clientReady = clientReady
api.getChangeLogsAtCursor = getChangeLogsAtCursor
api.subscribeToChange = subscribeToChange
api.subscribeToAllChangesInTable = subscribeToAllChangesInTable
api.unsubscribeFromChange = unsubscribeFromChange

export type Api = Comlink.RemoteObject<typeof api>

Comlink.expose(api, self as any)

initClient()
clientReady.then(onClientReady)
