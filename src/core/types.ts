export type SqlValue = null | string | number | bigint | Uint8Array
export type Row = Record<string, SqlValue>
export type Statement = { sql: string; params?: readonly SqlValue[] }
export type QueryResult = { columns: string[]; rows: SqlValue[][]; rowsAffected: number }
export type Unsubscribe = () => void
export type Migration = { id: string; sql: readonly string[] }
export type DatabaseOptions = {
	name?: string
	storage?: 'opfs' | 'memory'
	ownership?: 'shared' | 'exclusive'
	durableLog?: boolean
	migrations?: readonly Migration[]
	timeoutMs?: number
}
export type Change = {
	sequence: number
	table: string
	operation: 'INSERT' | 'UPDATE' | 'DELETE'
	key: Row
	oldKey: Row
	row: Row
}
export type CommitEvent = {
	kind: 'commit'
	revision: number
	changes: Change[]
	committedAt: number
	executionMs: number
	queryMs: number
	invalidations: number
	queryRuns: number
}
export type DatabaseEvent = CommitEvent | { kind: 'error'; message: string }
export type QuerySnapshot =
	| { status: 'loading' }
	| { status: 'error'; error: Error }
	| { status: 'ready'; columns: string[]; rows: readonly Row[]; revision: number; updatedAt: number }
export type QuerySpec = Statement | { table: string }
export interface LiveQuery {
	getSnapshot(): QuerySnapshot
	subscribe(listener: (snapshot: QuerySnapshot) => void): Unsubscribe
}
export type Inspection = {
	revision: number
	commits: number
	mutations: number
	queryRuns: number
	invalidations: number
	subscribers: number
	sessions: number
	queueRows: number
	wasmBytes: number
	queries: { sql: string; tables: string[]; subscribers: number; mode: 'incremental' | 'rerun' }[]
}
export type WireUpdate =
	| { kind: 'snapshot'; columns: string[]; rows: SqlValue[][]; revision: number }
	| { kind: 'patch'; changes: Change[]; revision: number }
	| { kind: 'error'; message: string }
export type WireListener = (update: WireUpdate) => void | Promise<void>
export interface WorkerApi {
	ready(): Promise<void>
	execute(statement: Statement): Promise<QueryResult>
	batch(statements: readonly Statement[]): Promise<QueryResult[]>
	watch(id: string, spec: QuerySpec, listener: WireListener): Promise<void>
	unwatch(id: string): Promise<void>
	observe(listener: (event: DatabaseEvent) => void | Promise<void>): Promise<void>
	inspect(): Promise<Inspection>
	exportDatabase(): Promise<Uint8Array>
	disconnect(): Promise<void>
}
export interface ReactiveDatabase {
	readonly ready: Promise<void>
	execute(sql: string, params?: readonly SqlValue[]): Promise<QueryResult>
	batch(statements: readonly Statement[]): Promise<QueryResult[]>
	liveQuery(sql: string, params?: readonly SqlValue[]): LiveQuery
	liveTable(table: string): LiveQuery
	subscribeEvents(listener: (event: DatabaseEvent) => void): Unsubscribe
	inspect(): Promise<Inspection>
	exportDatabase(): Promise<Uint8Array>
	close(): void
}
