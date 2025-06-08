import {
	Database,
	type Sqlite3Static,
	type WasmPointer
} from '@libsql/libsql-wasm-experimental'
import sqlite3InitModule from '@libsql/libsql-wasm-experimental'
import * as Comlink from 'comlink'
import { desc, gt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { generateTriggersForTable } from '../utils/triggers'
import { createClient, type InArgs, type Sqlite3Client } from './client-wasm'
import { batchDriver as batchDriverFn, driver as driverFn } from './drivers'
import { runMigrations } from './migrations'
import * as schema from './schema'
import type { DriverQuery, Sqlite3Method } from './types'

let db: Database
let client: Sqlite3Client
let drizzleClient: ReturnType<typeof drizzle>
const {
	promise: clientReady,
	resolve,
	reject
} = Promise.withResolvers<boolean>()

export type ChangeCallback = (change: schema.ChangeLog) => void
export type ChangeLogCallback = (change: schema.ChangeLog[]) => void
type TableName = keyof typeof schema
type PrimaryKey = string
const subscribers = new Map<TableName, Map<PrimaryKey, Set<ChangeCallback>>>()
const changeLogSubscribers = new Set<ChangeLogCallback>()
let logCursor = 0

/**
 * Subscribe to change events for a given table + primary key.
 * @param tableName  Name of the table you're interested in.
 * @param primaryKey  An object representing the PK fields (e.g. { id: 42 }).
 * @param callback  Invoked whenever a matching change fires.
 */
async function subscribeToChange(
	tableName: TableName,
	primaryKey: Record<string, unknown>,
	callback: ChangeCallback
) {
	await clientReady
	console.log('Worker: New subscriber for', tableName, primaryKey)
	console.log(location.origin)

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
async function subscribeToAllChangesInTable(
	tableName: TableName,
	callback: ChangeCallback
) {
	await clientReady
	console.log('Worker: New subscriber for all changes in', tableName)
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
	console.log(
		`Worker: Dispatching change notification for ${change.tbl_name} (${change.op_type})`
	)
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

const subscribeToChangeLog = async (callback: ChangeLogCallback) => {
	console.log('Worker: New change log subscriber')
	await clientReady
	changeLogSubscribers.add(callback)

	return Comlink.proxy(() => {
		changeLogSubscribers.delete(callback)
	})
}

const notifyChangeLogSubscribers = (changes: schema.ChangeLog[]) => {
	for (const cb of changeLogSubscribers) {
		try {
			cb(changes)
		} catch (err) {
			console.error('[Change Log Dispatch Error]', err)
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
		rowid: string
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
				rowid: rowid.toString()
			})
		},
		0 as WasmPointer
	)

	// On commit, read the persisted change_log rows, update ledger, and notify
	sqlite3.capi.sqlite3_commit_hook(
		db.pointer! as WasmPointer,
		(_cbArg: WasmPointer) => {
			if (changeLogBuffer.length === 0) {
				// const { rows } = getNewChangeLogsSync(0)
				// console.log(rows)
				// if (rows.length == 0) notifyChangeLogSubscribers(rows)

				console.log('TODO TELL THEM TO DELETE ALL MAYBE')
			} else {
				for (const rec of changeLogBuffer) {
					console.log(
						`→ ${rec.operation} on ${rec.dbName}.${
							rec.tableName
						} (rowid=${rec.rowid.toString()})`
					)
				}

				// Fetch the rows that were just written into change_log
				const { rows } = getNewChangeLogsSync(logCursor)
				console.log(
					`Worker: Fetched ${rows.length} change logs since last cursor ${logCursor}`
				)
				if (rows.length === 0) return 0
				notifyChangeLogSubscribers(rows)
				logCursor = Math.max(...rows.map(r => r.id), logCursor)
				for (const rec of rows) {
					dispatchChangeNotification(rec)
				}
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
		const { rows } = await client.execute(
			`SELECT name FROM sqlite_master WHERE type='table';`
		)
		await Promise.all(
			rows
				.map(row => row.name as string)
				.filter(n => !n.includes('sqlite_') && n !== 'change_log')
				.map(n => generateTriggersForTable(client, n))
		)

		setupChangeNotificationSystem(sqlite3) // run this after DB is initialized
		drizzleClient = drizzle(client, { schema })
		clientReady.then(onClientReady)
		resolve(true)
	} catch (err) {
		console.error('Worker: Error initializing client:', err)
		reject(false)
	}
}
const onClientReady = async () => {
	const { rows } = await getNewChangeLogs(0)

	logCursor = Math.max(...rows.map(r => r.id), logCursor)
	notifyChangeLogSubscribers(rows)
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

	return drizzleClient.select().from(schema.migrations).all()
}
const getNewChangeLogsSync = (lastSeenLogId: number) => {
	// Raw SQL to fetch everything with `id > lastSeenLogId`, ordered descending
	const result = client.executeSync(
		`SELECT *
		   FROM change_log
		  WHERE id > ?
		  ORDER BY id DESC`,
		[lastSeenLogId]
	)

	const rows = result.rows as any as schema.ChangeLog[]
	if (rows.length > 0) {
		console.log(
			`Worker: getNewChangeLogsSync: Found ${rows.length} new change logs since last seen ID ${lastSeenLogId}`
		)
	}

	return { rows }
}

const getChangeLogs = async (offset: number, limit: number) => {
	await clientReady

	const rows = await drizzleClient
		.select()
		.from(schema.changeLog)
		.orderBy(desc(schema.changeLog.id))
		.limit(limit)
		.offset(offset)
		.all()

	return { rows }
}

const getNewChangeLogs = async (from: number) => {
	await clientReady

	const rows = await drizzleClient
		.select()
		.from(schema.changeLog)
		.where(gt(schema.changeLog.id, from))
		.orderBy(desc(schema.changeLog.id))
		.all()
	if (rows.length > 0) {
		console.log(
			`Worker: getNewChangeLogs: Found ${rows.length} new change logs since last seen ID ${from}`
		)
	}
	return { rows }
}
export async function downloadLocalDB(api: Api) {
	const root = await navigator.storage.getDirectory()
	const fileName = await api.dbFileName()
	console.log(`Downloading database: (${fileName})`)
	const fileHandle = await root.getFileHandle('local.db')

	const file = await fileHandle.getFile()
	const arrayBuffer = await file.arrayBuffer()

	const blob = new Blob([arrayBuffer], { type: 'application/x-sqlite3' })
	const url = URL.createObjectURL(blob)

	const a = document.createElement('a')
	a.href = url
	a.download = 'local.db'
	document.body.appendChild(a)
	a.click()
	a.remove()

	URL.revokeObjectURL(url)
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
api.dbFileName = async () => {
	await clientReady
	return db.dbFilename()
}
api.clientReady = clientReady
api.getChangeLogs = (opts: { offset: number; limit: number }) =>
	getChangeLogs(opts.offset, opts.limit)
api.getNewChangeLogs = getNewChangeLogs

api.subscribeToChange = subscribeToChange
api.subscribeToAllChangesInTable = subscribeToAllChangesInTable
api.unsubscribeFromChange = unsubscribeFromChange
api.subscribeToChangeLog = subscribeToChangeLog
api.downloadLocalDB = downloadLocalDB
api.disconnect = () => {}

let ports: MessagePort[] = []
declare let onconnect: (e: MessageEvent) => void
onconnect = (e: MessageEvent) => {
	const port = e.ports[0]
	ports.push(port)
	console.log(ports.length, 'ports connected')
	port.start()
	const disconnect = () => {
		ports = ports.filter(p => p !== port)
	}
	api.disconnect = disconnect
	Comlink.expose(api, port)
}

initClient()
clientReady.then(onClientReady)

export type Api = Comlink.RemoteObject<typeof api>
