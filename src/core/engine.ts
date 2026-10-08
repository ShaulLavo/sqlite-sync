import type { Database, PreparedStatement, Sqlite3Static, WasmPointer } from '@sqlite.org/sqlite-wasm'
import { assertSingleStatement } from './sql'
import { drainChanges, installChangeTracking, removeChangeTracking, rowKey, queueName, quote, type TableInfo } from './changes'
import type { CommitEvent, DatabaseEvent, Inspection, QueryResult, QuerySpec, Row, SqlValue, Statement, WireListener, WireUpdate } from './types'

const now = () => performance.timeOrigin + performance.now()
const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const noop = () => {}
const argumentPragmas = new Set(['table_info', 'table_xinfo', 'table_list', 'index_info', 'index_xinfo', 'index_list', 'foreign_key_list', 'foreign_key_check', 'integrity_check', 'quick_check'])
type Plan = { tables: Set<string>; schema: boolean; dml: boolean; readOnly: boolean; allowSavepoints: boolean; droppingTables: Set<string> }
type CachedStatement = { stmt: PreparedStatement; plan: Plan; columns: string[] }
type QueryGroup = { sql: string; params: readonly SqlValue[]; tables: Set<string>; table: TableInfo | undefined; listeners: Map<string, WireListener>; snapshot: WireUpdate }

export class ReactiveEngine {
	#tables: Map<string, TableInfo>
	#queries = new Map<string, QueryGroup>()
	#subscriptions = new Map<string, string>()
	#observers = new Map<string, (event: DatabaseEvent) => void | Promise<void>>()
	#plan: Plan | undefined
	#commitHint = false
	#revision = 0
	#commits = 0
	#mutations = 0
	#queryRuns = 0
	#invalidations = 0
	#closed = false
	#inBatch = false
	#schemaDirty = false
	#autocommit: () => boolean
	#statements = new Map<string, CachedStatement>()
	#tableQueries = new Map<string, Set<QueryGroup>>()
	#maxVariables: number

	constructor(readonly sqlite3: Sqlite3Static, readonly db: Database, readonly durableLog = false) {
		const nativeAutocommit: unknown = Reflect.get(sqlite3.capi, 'sqlite3_get_autocommit')
		if (typeof nativeAutocommit !== 'function') throw new Error('SQLite autocommit API unavailable')
		this.#autocommit = () => Boolean(nativeAutocommit(db.pointer))
		const variableOption = db.selectValues('PRAGMA compile_options').find(value => String(value).startsWith('MAX_VARIABLE_NUMBER='))
		this.#maxVariables = variableOption ? Number(String(variableOption).split('=')[1]) : 999
		db.exec('PRAGMA foreign_keys=ON; PRAGMA recursive_triggers=ON; PRAGMA temp_store=MEMORY')
		this.#tables = installChangeTracking(db, durableLog)
		sqlite3.capi.sqlite3_commit_hook(db, () => { this.#commitHint = true; return 0 }, 0 as WasmPointer)
		sqlite3.capi.sqlite3_rollback_hook(db, () => { this.#commitHint = false; return 0 }, 0 as WasmPointer)
		sqlite3.capi.sqlite3_set_authorizer(db, (_, action, a, b, database, source) => this.#authorize(action, a, b, database, source), 0 as WasmPointer)
	}

	#authorize(action: number, table: string | 0, second: string | 0, database: string | 0, source: string | 0): number {
		const plan = this.#plan
		const c = this.sqlite3.capi
		if (!plan) return c.SQLITE_OK
		if (action === c.SQLITE_READ) {
			if (plan.readOnly && (database === 'main' || database === 0) && typeof table === 'string') plan.tables.add(table)
			return typeof table === 'string' && table.startsWith('_sqlite_sync_') && !source ? c.SQLITE_DENY : c.SQLITE_OK
		}
		if (action === c.SQLITE_SELECT || action === c.SQLITE_FUNCTION || action === c.SQLITE_RECURSIVE) return c.SQLITE_OK
		if (plan.readOnly) return c.SQLITE_DENY
		if (source && source.startsWith('_sqlite_sync_')) return c.SQLITE_OK
		if (action === c.SQLITE_DROP_TABLE && typeof table === 'string') plan.droppingTables.add(table)
		if (typeof table === 'string' && table.startsWith('_sqlite_sync_') && !plan.droppingTables.has(String(second))) return c.SQLITE_DENY
		if (action === c.SQLITE_CREATE_VTABLE || action === c.SQLITE_CREATE_TEMP_TABLE || action === c.SQLITE_ATTACH || action === c.SQLITE_DETACH || action === c.SQLITE_TRANSACTION) return c.SQLITE_DENY
		if (action === c.SQLITE_PRAGMA && second && !argumentPragmas.has(String(table).toLowerCase())) return c.SQLITE_DENY
		if (!source && table !== 'sqlite_master' && table !== 'sqlite_schema' && (action === c.SQLITE_INSERT || action === c.SQLITE_UPDATE || action === c.SQLITE_DELETE)) plan.dml = true
		if (action === c.SQLITE_SAVEPOINT && !plan.allowSavepoints) return c.SQLITE_DENY
		if (action === c.SQLITE_CREATE_INDEX || action === c.SQLITE_DROP_INDEX || action === c.SQLITE_CREATE_TABLE || action === c.SQLITE_DROP_TABLE || action === c.SQLITE_ALTER_TABLE || action === c.SQLITE_CREATE_VIEW || action === c.SQLITE_DROP_VIEW || action === c.SQLITE_CREATE_TRIGGER || action === c.SQLITE_DROP_TRIGGER) plan.schema = true
		return c.SQLITE_OK
	}

	#run(statement: Statement, readOnly = false): { result: QueryResult; plan: Plan } {
		if (this.#closed) throw new Error('Database is closed')
		const key = `${readOnly}:${this.#inBatch}:${statement.sql}`
		let cached = this.#statements.get(key)
		const plan: Plan = cached?.plan ?? { tables: new Set(), schema: false, dml: false, readOnly, allowSavepoints: this.#inBatch, droppingTables: new Set() }
		this.#plan = plan
		let completed = false
		let ownsSchemaTransaction = false
		let schemaVersion: number | undefined
		try {
			if (!cached) {
				assertSingleStatement(statement.sql, this.sqlite3.capi.sqlite3_complete)
				const stmt = this.db.prepare(statement.sql)
				cached = { stmt, plan, columns: stmt.columnCount ? stmt.getColumnNames() : [] }
			}
			const { stmt, columns } = cached
			if (plan.schema && !this.sqlite3.capi.sqlite3_stmt_isexplain(stmt) && !this.sqlite3.capi.sqlite3_stmt_readonly(stmt)) {
				ownsSchemaTransaction = !this.#inBatch
				schemaVersion = this.#prepareSchemaChange(ownsSchemaTransaction)
			}
			if (statement.params?.length) stmt.bind([...statement.params])
			const rows: SqlValue[][] = []
			while (stmt.step()) rows.push(stmt.get([]).map(normalizeValue))
			completed = true
			const rowsAffected = plan.dml && !plan.schema && !this.sqlite3.capi.sqlite3_stmt_isexplain(stmt) && !this.sqlite3.capi.sqlite3_stmt_readonly(stmt) ? this.db.changes() : 0
			return { result: { columns, rows, rowsAffected }, plan }
		} finally {
			this.#plan = undefined
			if (cached) this.#retainStatement(key, cached, completed)
			if (ownsSchemaTransaction || schemaVersion !== undefined) this.#finishSchemaChange(ownsSchemaTransaction, completed, schemaVersion)
		}
	}

	#prepareSchemaChange(ownTransaction: boolean) {
		const plan = this.#plan
		this.#plan = undefined
		try {
			if (ownTransaction) this.db.exec('BEGIN IMMEDIATE')
			this.#clearStatements()
			removeChangeTracking(this.db)
			return Number(this.db.selectValue('PRAGMA schema_version'))
		} finally { this.#plan = plan }
	}
	#finishSchemaChange(ownTransaction: boolean, completed: boolean, before: number | undefined) {
		let committed = false
		try {
			if (completed) this.#refreshSchema(before)
			if (ownTransaction && completed) { this.db.exec('COMMIT'); committed = true }
		} finally {
			if (ownTransaction && !committed) this.#restoreSchemaAfterRollback()
		}
	}
	#restoreSchemaAfterRollback() {
		if (!this.#autocommit()) this.db.exec('ROLLBACK')
		this.#clearStatements()
		this.#tables = installChangeTracking(this.db, this.durableLog)
		this.#schemaDirty = false
		this.#commitHint = false
	}

	#retainStatement(key: string, cached: CachedStatement, completed: boolean) {
		this.#statements.delete(key)
		if (!completed || cached.plan.schema) { cached.stmt.finalize(); return }
		cached.stmt.reset(true)
		this.#statements.set(key, cached)
		if (this.#statements.size <= 128) return
		const oldest = this.#statements.keys().next().value
		if (oldest === undefined) return
		this.#statements.get(oldest)?.stmt.finalize()
		this.#statements.delete(oldest)
	}

	#clearStatements() {
		for (const cached of this.#statements.values()) cached.stmt.finalize()
		this.#statements.clear()
	}
	#refreshSchema(before: number | undefined) {
		const changed = Number(this.db.selectValue('PRAGMA schema_version')) !== before
		this.#clearStatements()
		this.#tables = installChangeTracking(this.db, this.durableLog)
		if (changed) this.#schemaDirty = true
	}

	execute(statement: Statement): QueryResult {
		const start = performance.now()
		try { return this.#run(statement).result }
		finally { this.#publish(performance.now() - start) }
	}

	batch(statements: readonly Statement[]): QueryResult[] {
		if (this.#closed) throw new Error('Database is closed')
		const start = performance.now()
		this.db.exec('BEGIN IMMEDIATE')
		this.#inBatch = true
		let committed = false
		try {
			const results = statements.map(statement => this.#run(statement).result)
			this.db.exec('COMMIT')
			committed = true
			return results
		} finally {
			if (!this.#autocommit()) this.db.exec('ROLLBACK')
			this.#inBatch = false
			if (!committed && this.#schemaDirty) this.#restoreSchemaAfterRollback()
			this.#publish(performance.now() - start)
		}
	}

	#publish(executionMs: number) {
		if (!this.#autocommit() || (!this.#commitHint && !this.#schemaDirty)) return
		const committedAt = now()
		if (this.#commitHint) this.#commits++
		this.#commitHint = false
		const observationStart = performance.now()
		const changes = drainChanges(this.db)
		const observationMs = performance.now() - observationStart
		this.#commitHint = false
		if (!changes.length && !this.#schemaDirty) return
		this.#revision++
		this.#mutations += changes.length
		const start = performance.now()
		const changedTables = new Set(changes.map(change => change.table))
		if (this.durableLog) changedTables.add('change_log')
		let invalidations = 0
		let queryRuns = 0
		const affected = this.#schemaDirty ? new Set(this.#queries.values()) : new Set([...changedTables].flatMap(table => [...this.#tableQueries.get(table) ?? []]))
		for (const group of affected) {
			if (this.#schemaDirty && group.table) group.table = undefined
			invalidations++
			queryRuns += this.#updateQuery(group, changes)
		}
		this.#schemaDirty = false
		this.#invalidations += invalidations
		const event: CommitEvent = { kind: 'commit', revision: this.#revision, changes, committedAt, executionMs, observationMs, totals: { commits: this.#commits, mutations: this.#mutations, queryRuns: this.#queryRuns, invalidations: this.#invalidations }, queryMs: performance.now() - start, invalidations, queryRuns }
		for (const observer of this.#observers.values()) this.#deliver(observer, event)
	}

	#updateQuery(group: QueryGroup, changes: CommitEvent['changes']): number {
		if (group.table) {
			const update = this.#committedPatch(group.table, changes)
			for (const listener of group.listeners.values()) this.#deliver(listener, update.packet)
			return update.queries
		}

		try {
			const { result, plan } = this.#run({ sql: group.sql, params: group.params }, true)
			this.#indexQuery(group, plan.tables)
			const unchanged = group.snapshot.kind === 'snapshot' && equalRows(group.snapshot.rows, result.rows) && group.snapshot.columns.join('\0') === result.columns.join('\0')
			group.snapshot = { kind: 'snapshot', columns: result.columns, rows: result.rows, revision: this.#revision }
			this.#queryRuns++
			if (unchanged) return 1
		} catch (error) { group.snapshot = { kind: 'error', message: message(error) } }
		for (const listener of group.listeners.values()) this.#deliver(listener, group.snapshot)
		return 1
	}

	#committedPatch(table: TableInfo, changes: CommitEvent['changes']) {
		const keys = new Map<string, Row>()
		for (const change of changes) {
			if (change.table !== table.name) continue
			keys.set(rowKey(change.key), change.key)
			keys.set(rowKey(change.oldKey), change.oldKey)
		}
		const touched = [...keys.values()]
		const rows: { key: Row; row: Row }[] = []
		let queries = 0
		const chunkSize = Math.max(1, Math.min(500, Math.floor(this.#maxVariables / table.keys.length)))
		for (let start = 0; start < touched.length; start += chunkSize) {
			const chunk = touched.slice(start, start + chunkSize)
			rows.push(...this.#readAffectedRows(table, chunk))
			queries++
		}
		const remaining = new Set(rows.map(row => rowKey(row.key)))
		const packet: WireUpdate = { kind: 'patch', rows, removed: touched.filter(key => !remaining.has(rowKey(key))), revision: this.#revision }
		return { packet, queries }
	}
	#readAffectedRows(table: TableInfo, keys: Row[]) {
		const params: SqlValue[] = []
		const tuples = keys.map(key => `(${table.keys.map(column => keyBinding(key[column], params)).join(',')})`).join(',')
		const sql = `SELECT * FROM ${quote(table.name)} WHERE (${table.keys.map(quote).join(',')}) IN (VALUES ${tuples})`
		const { result } = this.#run({ sql, params }, true)
		this.#queryRuns++
		return result.rows.map(values => {
			const row = Object.fromEntries(result.columns.map((column, i) => [column, values[i]]))
			return { key: Object.fromEntries(table.keys.map(column => [column, row[column]])), row }
		})
	}

	#deliver<T>(listener: (value: T) => void | Promise<void>, value: T) {
		try { Promise.resolve(listener(value)).catch(noop) }
		catch { /* A disconnected observer cannot undo a committed transaction. */ }
	}

	watch(id: string, spec: QuerySpec, listener: WireListener) {
		this.unwatch(id)
		const metadata = 'table' in spec ? this.#tables.get(spec.table) : undefined
		if ('table' in spec && !metadata) throw new Error('Unknown or unsupported table')
		const table = metadata?.stableKey ? metadata : undefined
		const sql = 'table' in spec ? `SELECT * FROM ${quote(spec.table)}` : spec.sql
		const params = 'table' in spec ? [] : spec.params ?? []
		const key = JSON.stringify([sql, params, Boolean(table)], (_, value: unknown) => typeof value === 'bigint' ? { bigint: String(value) } : value)
		let group = this.#queries.get(key)
		if (!group) {
			const { result, plan } = this.#run({ sql, params }, true)
			this.#queryRuns++
			group = { sql, params, table, tables: plan.tables, listeners: new Map(), snapshot: { kind: 'snapshot', columns: result.columns, rows: result.rows, revision: this.#revision, keyColumns: table?.keys } }
			this.#queries.set(key, group)
			this.#indexQuery(group, plan.tables)
		}
		this.#subscriptions.set(id, key)
		group.listeners.set(id, listener)
		// Incremental groups do not retain another copy of the collection in the worker.
		if (table && group.listeners.size > 1) {
			const { result } = this.#run({ sql, params }, true)
			this.#queryRuns++
			this.#deliver(listener, { kind: 'snapshot', columns: result.columns, rows: result.rows, revision: this.#revision, keyColumns: table.keys })
			group.snapshot = { kind: 'snapshot', columns: result.columns, rows: [], revision: this.#revision }
			return
		}
		this.#deliver(listener, group.snapshot)
		if (table && group.snapshot.kind === 'snapshot') group.snapshot = { ...group.snapshot, rows: [] }
	}

	unwatch(id: string) {
		const key = this.#subscriptions.get(id)
		if (!key) return
		const group = this.#queries.get(key)
		group?.listeners.delete(id)
		if (group && !group.listeners.size) { this.#indexQuery(group, new Set()); this.#queries.delete(key) }
		this.#subscriptions.delete(id)
	}

	#indexQuery(group: QueryGroup, tables: Set<string>) {
		for (const previous of group.tables) {
			const old = this.#tableQueries.get(previous)
			old?.delete(group)
			if (!old?.size) this.#tableQueries.delete(previous)
		}
		group.tables = tables
		for (const table of tables) {
			const queries = this.#tableQueries.get(table) ?? new Set<QueryGroup>()
			queries.add(group)
			this.#tableQueries.set(table, queries)
		}
	}

	observe(id: string, listener: (event: DatabaseEvent) => void | Promise<void>) { this.#observers.set(id, listener) }
	unobserve(id: string) { this.#observers.delete(id) }

	inspect(sessions = 1): Inspection {
		return { revision: this.#revision, commits: this.#commits, mutations: this.#mutations, queryRuns: this.#queryRuns, invalidations: this.#invalidations, subscribers: this.#subscriptions.size, sessions, queueRows: Number(this.db.selectValue(`SELECT count(*) FROM temp.${quote(queueName)}`)), wasmBytes: this.sqlite3.wasm.heap8u().buffer.byteLength, queries: [...this.#queries.values()].map(group => ({ sql: group.sql, tables: [...group.tables], subscribers: group.listeners.size, mode: group.table ? 'incremental' : 'rerun' })) }
	}

	close() {
		if (this.#closed) return
		this.#closed = true
		this.#clearStatements()
		this.#tableQueries.clear()
		this.#queries.clear()
		this.#subscriptions.clear()
		this.#observers.clear()
		Reflect.apply(this.sqlite3.capi.sqlite3_set_authorizer, this.sqlite3.capi, [this.db, 0, 0])
		this.sqlite3.capi.sqlite3_commit_hook(this.db, 0, 0)
		this.sqlite3.capi.sqlite3_rollback_hook(this.db, 0, 0)
		this.db.close()
	}
}

function equalRows(a: SqlValue[][], b: SqlValue[][]): boolean {
	return a.length === b.length && a.every((row, i) => row.length === b[i].length && row.every((value, j) => equalValue(value, b[i][j])))
}
function equalValue(a: SqlValue, b: SqlValue): boolean {
	if (a instanceof Uint8Array && b instanceof Uint8Array) return a.length === b.length && a.every((byte, i) => byte === b[i])
	return Object.is(a, b)
}

function normalizeValue(value: import('@sqlite.org/sqlite-wasm').SqlValue): SqlValue {
	if (value instanceof ArrayBuffer) return new Uint8Array(value)
	if (value instanceof Int8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
	return value
}

function keyBinding(value: SqlValue, params: SqlValue[]): string {
	if (value === Infinity) return '9e999'
	if (value === -Infinity) return '-9e999'
	params.push(value)
	return '?'
}
