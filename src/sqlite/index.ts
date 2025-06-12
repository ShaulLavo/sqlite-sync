import sqlite3InitModule, {
	Database,
	type Sqlite3Static,
	type WasmPointer
} from '@libsql/libsql-wasm-experimental'
import * as Comlink from 'comlink'
import { desc, gt } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient, type InArgs, type Sqlite3Client } from './client-wasm'
import { batchDriver as batchDriverFn, driver as driverFn } from './drivers'
import { runMigrations } from './migrations'
import * as schema from './schema'
import { generateAllTriggers } from './triggers'
import type { DriverQuery, Sqlite3Method } from './types'
import { tap } from '../utils/functions'

const shouldLog = false
const log = (...params: any[]) => shouldLog && console.log(...params)

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
const subscribers = new Map<
	TableName,
	Map<PrimaryKey, Set<ChangeLogCallback>>
>()
const changeLogSubscribers = new Set<ChangeLogCallback>()
let logCursor = 0

const initClient = async () => {
	try {
		const sqlite3 = await sqlite3InitModule()

		const path = 'file:local.db'
		const poolUtil = await sqlite3.installOpfsSAHPoolVfs({
			name: path,
			initialCapacity: 10
		})

		;[client, db] = createClient({ url: path, poolUtil }, sqlite3)
		await client.execute(`PRAGMA foreign_keys = ON;`)
		await runMigrations(client)

		await generateAllTriggers(client)

		drizzleClient = drizzle(client, { schema })
		resolve(true)
	} catch (err) {
		console.error('Worker: Error initializing client:', err)
		reject(false)
	}
}

async function subscribeToRow(
	tableName: TableName,
	primaryKey: Record<string, unknown>,
	callback: ChangeLogCallback
) {
	await clientReady
	log('Worker: New subscriber for', tableName, primaryKey)
	log(location.origin)

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
		unsubscribeFromRow(tableName, primaryKey, callback)
	})
}

function unsubscribeFromRow(
	tableName: TableName,
	primaryKey: Record<string, unknown>,
	callback: ChangeLogCallback
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

async function subscribeToTable(
	tableName: TableName,
	callback: ChangeLogCallback
) {
	await clientReady
	log('Worker: New subscriber for all changes in', tableName)
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
		unsubscribeFromTable(tableName, callback)
	})
}

function unsubscribeFromTable(
	tableName: TableName,
	callback: ChangeLogCallback
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

function dispatchChangeNotification(change: schema.ChangeLog) {
	const tableMap = subscribers.get(change.tbl_name as TableName)
	log(
		`Worker: Dispatching change notification for ${change.tbl_name} (${change.op_type})`
	)
	if (!tableMap) return

	const wildcardKey = '*'
	const allSet = tableMap.get(wildcardKey)
	if (allSet) {
		for (const cb of allSet) {
			try {
				cb([change])
			} catch (err) {
				console.error('[Change Dispatch Error]', err)
			}
		}
	}

	const pkString = change.pk_json
	const pkSet = tableMap.get(pkString)
	if (!pkSet) return

	for (const cb of pkSet) {
		try {
			cb([change])
		} catch (err) {
			console.error('[Change Dispatch Error]', err)
		}
	}
}

function dispatchChangeNotificationBatched(changes: schema.ChangeLog[]) {
	const byTable = new Map<TableName, schema.ChangeLog[]>()
	for (const change of changes) {
		const tbl = change.tbl_name as TableName
		if (!byTable.has(tbl)) byTable.set(tbl, [])
		byTable.get(tbl)!.push(change)
	}

	for (const [tbl, tblChanges] of byTable) {
		const tableMap = subscribers.get(tbl)

		if (!tableMap) continue

		const allSet = tableMap.get('*')
		if (allSet) {
			for (const cb of allSet) {
				try {
					cb(tblChanges)
				} catch (err) {
					console.error('[Batch Change Dispatch Error]', err)
				}
			}
		}

		const byPk = new Map<string, schema.ChangeLog[]>()
		for (const c of tblChanges) {
			const key = c.pk_json
			if (!byPk.has(key)) byPk.set(key, [])
			byPk.get(key)!.push(c)
		}

		for (const [pk, pkChanges] of byPk) {
			const pkSet = tableMap.get(pk)
			if (!pkSet) continue
			for (const cb of pkSet) {
				try {
					cb(pkChanges)
				} catch (err) {
					console.error('[Batch Change Dispatch Error]', err)
				}
			}
		}
	}
}

const subscribeToChangeLog = async (callback: ChangeLogCallback) => {
	log('Worker: New change log subscriber')
	await clientReady
	changeLogSubscribers.add(callback)

	return Comlink.proxy(() => {
		changeLogSubscribers.delete(callback)
	})
}

const opCounts: Record<'INSERT' | 'UPDATE' | 'DELETE', number> = {
	INSERT: 0,
	UPDATE: 0,
	DELETE: 0
}
let lastWindow = performance.now()

const notifyChangeLogSubscribers = (changes: schema.ChangeLog[]) => {
	for (const { op_type } of changes) {
		if (op_type in opCounts) {
			opCounts[op_type as keyof typeof opCounts] += 1
		}
	}

	const now = performance.now()
	if (now - lastWindow >= 1000) {
		console.log(
			`[Throughput] ${opCounts.INSERT} inserts/s, ` +
				`${opCounts.UPDATE} updates/s, ` +
				`${opCounts.DELETE} deletes/s`
		)
		opCounts.INSERT = opCounts.UPDATE = opCounts.DELETE = 0
		lastWindow = now
	}

	for (const cb of changeLogSubscribers) {
		try {
			cb(changes)
		} catch (err) {
			console.error('[Change Log Dispatch Error]', err)
		}
	}
}

const changeLogQueue: schema.ChangeLog[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_DELAY_MS = 10

function flushChangeLogs() {
	const batch = changeLogQueue.splice(0, changeLogQueue.length)
	if (batch.length === 0) return

	notifyChangeLogSubscribers(batch)
	dispatchChangeNotificationBatched(batch)
}

const notifyBuffered = tap(() => {
	const { rows } = getNewChangeLogsSync(logCursor)
	log(
		`Worker: Fetched ${rows.length} change logs since last cursor ${logCursor}`
	)
	if (rows.length > 0) {
		changeLogQueue.push(...rows)

		logCursor = Math.max(...rows.map(r => r.id), logCursor)

		if (!flushTimer) {
			flushTimer = setTimeout(() => {
				flushChangeLogs()
				flushTimer = null
			}, FLUSH_DELAY_MS)
		}
	}
})

const notifyBatched = tap(() => {
	const { rows } = getNewChangeLogsSync(logCursor)
	log(
		`Worker: Fetched ${rows.length} change logs since last cursor ${logCursor}`
	)
	if (rows.length === 0) return
	notifyChangeLogSubscribers(rows)
	logCursor = Math.max(...rows.map(r => r.id), logCursor)
	dispatchChangeNotificationBatched(rows)
})
const notify = tap(() => {
	const { rows } = getNewChangeLogsSync(logCursor)
	log(
		`Worker: Fetched ${rows.length} change logs since last cursor ${logCursor}`
	)
	if (rows.length === 0) return
	notifyChangeLogSubscribers(rows)
	logCursor = Math.max(...rows.map(r => r.id), logCursor)
	for (const rec of rows) {
		dispatchChangeNotification(rec)
	}
})

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

	sqlite3.capi.sqlite3_commit_hook(
		db.pointer! as WasmPointer,
		(_cbArg: WasmPointer) => {
			if (changeLogBuffer.length === 0) {
				log('No changes in transaction buffer')
			} else {
				for (const rec of changeLogBuffer) {
					log(
						`→ ${rec.operation} on ${rec.dbName}.${
							rec.tableName
						} (rowid=${rec.rowid.toString()})`
					)
				}

				const { rows } = getNewChangeLogsSync(logCursor)
				log(
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

const onClientReady = async () => {
	log('Worker: Client is ready!')
	const { rows } = await getNewChangeLogs(0)

	logCursor = Math.max(...rows.map(r => r.id), logCursor)
	notifyChangeLogSubscribers(rows.slice(-500))
}

const ping = (s: string) => {
	log('Worker: ping received:', s)
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
	return driverFn(client, sql, params, method).then(notifyBatched)
}

const batchDriver = async (queries: DriverQuery[]) => {
	await clientReady
	return batchDriverFn(client, queries).then(notifyBatched)
}
const selectMigrations = async () => {
	await clientReady

	return drizzleClient.select().from(schema.migrations).all()
}

const getNewChangeLogsSync = (lastSeenLogId: number) => {
	const result = client.executeSync(
		`SELECT *
		   FROM change_log
		  WHERE id > ?
		  ORDER BY id DESC`,
		[lastSeenLogId]
	)

	const rows = result.rows as any as schema.ChangeLog[]
	if (rows.length > 0) {
		log(
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
		log(
			`Worker: getNewChangeLogs: Found ${rows.length} new change logs since last seen ID ${from}`
		)
	}
	return { rows }
}
const downloadLocalDB = async () => {
	await clientReady
	const root = await navigator.storage.getDirectory()
	const fileName = db.dbFilename()
	log(`Preparing database download: (${fileName})`)
	const fileHandle = await root.getFileHandle('local.db')

	const file = await fileHandle.getFile()
	const arrayBuffer = await file.arrayBuffer()

	return new Blob([arrayBuffer], { type: 'application/x-sqlite3' })
}

const resetDatabase = async () => {
	await clientReady
	await client.execute(`PRAGMA foreign_keys = OFF;`)
	const { rows: tables } = await client.execute(`
    SELECT name
      FROM sqlite_master
     WHERE type='table'
       AND name NOT LIKE 'sqlite_%';
  `)
	for (const { name } of tables) {
		await client.execute(`DROP TABLE IF EXISTS "${name}";`)
	}
	await client.execute(`DELETE FROM sqlite_sequence;`)
	await client.execute(`VACUUM;`)
	logCursor = 0
	await runMigrations(client)
	await client.execute(`PRAGMA foreign_keys = ON;`)
}

const api = (cb: () => any) => {
	log('Worker: API called')
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

api.subscribeToRow = subscribeToRow
api.subscribeToTable = subscribeToTable
api.unsubscribeFromRow = unsubscribeFromRow
api.subscribeToChangeLog = subscribeToChangeLog
api.downloadLocalDB = downloadLocalDB
api.debug = {
	resetDatabase
}

const portApi = {
	...api
}
initClient().then(onClientReady)
Comlink.expose(portApi)

export type Api = Comlink.RemoteObject<typeof api & { disconnect: () => void }>
