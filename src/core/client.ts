import * as Comlink from 'comlink'
import { rowKey } from './changes'
import type { DatabaseEvent, DatabaseOptions, Inspection, LiveQuery, QueryResult, QuerySnapshot, QuerySpec, ReactiveDatabase, Row, SqlValue, Statement, Unsubscribe, WireUpdate, WorkerApi } from './types'

function cacheKey(spec: QuerySpec): string {
	return JSON.stringify(spec, (_, value: unknown) => typeof value === 'bigint' ? { bigint: String(value) } : value)
}
function report(error: unknown): Error { return error instanceof Error ? error : new Error(String(error)) }
function deliver<T>(listener: (value: T) => void, value: T) { try { listener(value) } catch (error) { console.error('sqlite-sync subscriber failed', error) } }

class ClientQuery implements LiveQuery {
	#snapshot: QuerySnapshot = { status: 'loading' }
	#listeners = new Set<(snapshot: QuerySnapshot) => void>()
	#rows = new Map<string, Row>()
	#columns: string[] = []
	#keys: string[] = []
	#token = 0
	#id = ''
	constructor(readonly database: BrowserDatabase, readonly spec: QuerySpec) {}
	getSnapshot() { return this.#snapshot }
	reconnect() {
		this.#snapshot = { status: 'loading' }
		for (const listener of this.#listeners) deliver(listener, this.#snapshot)
		if (this.#listeners.size) this.#start()
	}
	subscribe(listener: (snapshot: QuerySnapshot) => void): Unsubscribe {
		const first = this.#listeners.size === 0
		this.#listeners.add(listener)
		deliver(listener, this.#snapshot)
		if (first) this.#start()
		let active = true
		return () => {
			if (!active) return
			active = false
			this.#listeners.delete(listener)
			if (this.#listeners.size) return
			this.#token++
			void this.database.unwatch(this.#id)
			this.database.removeQuery(this.spec, this)
			this.#rows.clear()
			this.#snapshot = { status: 'loading' }
		}
	}

	#start() {
		const token = ++this.#token
		this.#id = crypto.randomUUID()
		this.database.addQuery(this.spec, this)
		void this.database.watch(this.#id, this.spec, update => {
			if (token !== this.#token || !this.#listeners.size) return
			this.#apply(update)
		}).catch(error => { if (token === this.#token) this.fail(report(error)) })
	}

	#apply(update: WireUpdate) {
		if (update.kind === 'error') { this.fail(new Error(update.message)); return }
		if (this.#snapshot.status === 'ready' && update.revision < this.#snapshot.revision) return
		if (update.kind === 'snapshot') {
			this.#columns = uniqueColumns(update.columns)
			this.#keys = update.keyColumns ?? []
			const previous = this.#rows
			this.#rows = new Map(update.rows.map((values, index) => {
				const row = Object.fromEntries(this.#columns.map((column, i) => [column, values[i]]))
				const key = this.#keys.length ? this.#key(row) : String(index)
				const old = previous.get(key)
				return [key, old && equalRow(old, row) ? old : row]
			}))
		} else {
			for (const key of update.removed) this.#rows.delete(rowKey(key))
			for (const entry of update.rows) {
				const key = rowKey(entry.key)
				const old = this.#rows.get(key)
				this.#rows.set(key, old && equalRow(old, entry.row) ? old : entry.row)
			}
		}
		this.#snapshot = { status: 'ready', columns: this.#columns, rows: [...this.#rows.values()], revision: update.revision, updatedAt: performance.timeOrigin + performance.now() }
		for (const listener of this.#listeners) deliver(listener, this.#snapshot)
	}

	#key(row: Row) { return rowKey(Object.fromEntries(this.#keys.map(key => [key, row[key]]))) }
	fail(error: Error) {
		this.#snapshot = { status: 'error', error }
		for (const listener of this.#listeners) deliver(listener, this.#snapshot)
	}
}

function equalRow(a: Row, b: Row): boolean {
	return Object.keys(b).length === Object.keys(a).length && Object.entries(b).every(([key, value]) => {
		const old = a[key]
		if (old instanceof Uint8Array && value instanceof Uint8Array) return old.length === value.length && old.every((byte, i) => byte === value[i])
		return Object.is(old, value)
	})
}

export class BrowserDatabase implements ReactiveDatabase {
	#ready: Promise<void>
	get ready() { return this.#ready }
	#remote: Comlink.Remote<WorkerApi>
	#port: MessagePort
	#worker: Worker | undefined
	#control: MessagePort | undefined
	#closed = false
	#failure: Error | undefined
	#queries = new Map<string, ClientQuery>()
	#observers = new Set<(event: DatabaseEvent) => void>()
	#releaseSession: () => void = () => {}
	#timeoutMs: number
	#sessionId = ''
	#epoch = 0
	#observing = false
	#pending = new Set<(error: Error) => void>()

	constructor(options: DatabaseOptions = {}) {
		this.#timeoutMs = options.timeoutMs ?? 30_000
		const { port1, port2 } = new MessageChannel()
		this.#port = port1
		this.#remote = Comlink.wrap<WorkerApi>(port1)
		port1.start()
		const sessionId = `sqlite-sync-session:${crypto.randomUUID()}`
		this.#sessionId = sessionId
		const initialized = this.#connect(options, sessionId, port2).then(() => this.#remote.ready())
		this.#ready = this.#initialize(initialized)
		void this.#ready.catch(error => this.#fail(report(error)))
	}

	#initialize(initialized: Promise<void>) {
		return this.#request(initialized).then(async () => {
			if (this.#observers.size) await this.#observe()
		})
	}
	#observe() {
		if (this.#observing) return Promise.resolve()
		this.#observing = true
		return this.#request(this.#remote.observe(Comlink.proxy(event => {
			for (const listener of this.#observers) deliver(listener, event)
		})))
	}

	async #connect(options: DatabaseOptions, sessionId: string, endpoint: MessagePort) {
		const sharedOwnership = options.ownership !== 'exclusive' && typeof SharedWorker !== 'undefined'
		const storageOptions = { name: options.name ?? 'local.db', storage: options.storage ?? 'opfs', durableLog: options.durableLog ?? false, migrations: options.migrations ?? [], legacyJournal: options.legacyJournal, ownership: sharedOwnership ? 'shared' : 'exclusive' }
		if (typeof storageOptions.name !== 'string' || !storageOptions.name || /[\/\\\0]/.test(storageOptions.name)) throw new Error('Database name must be a nonempty filename without path separators')
		if (!navigator.locks) throw new Error('Web Locks are required for safe database ownership')
		await new Promise<void>((resolve, reject) => {
			void navigator.locks.request(sessionId, async () => {
				resolve()
				await new Promise<void>(release => { this.#releaseSession = release })
			}).catch(reject)
		})
		if (this.#closed) { this.#releaseSession(); return }
		const data = { type: 'connect', sessionId, options: storageOptions }
		if (sharedOwnership) {
			const shared = new SharedWorker(new URL('./shared.worker.ts', import.meta.url), { type: 'module', name: `sqlite-sync:${options.name ?? 'local.db'}` })
			this.#control = shared.port
			shared.addEventListener('error', event => this.#fail(new Error(event instanceof ErrorEvent ? event.message : 'Shared database worker failed')))
			shared.port.addEventListener('message', ({ data: event }) => {
				if (event?.type === 'failure') this.#fail(new Error(String(event.message)))
				if (event?.type === 'host') this.#host(event.epoch)
				if (event?.type === 'reconnect') this.#reconnect(event.epoch)
			})
			shared.port.start()
			shared.port.postMessage(data, [endpoint])
			return
		}
		this.#worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' })
		this.#worker.addEventListener('error', event => this.#fail(new Error(event.message || 'Database worker failed')))
		this.#worker.postMessage(data, [endpoint])
	}

	#host(epoch: number) {
		if (this.#closed) return
		this.#epoch = epoch
		this.#worker?.terminate()
		this.#worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url), { type: 'module' })
		this.#worker.addEventListener('error', event => this.#control?.postMessage({ type: 'owner-failed', sessionId: this.#sessionId, epoch, message: event.message || 'Database worker failed' }))
		const { port1, port2 } = new MessageChannel()
		this.#worker.postMessage({ type: 'broker' }, [port1])
		this.#control?.postMessage({ type: 'hosted', sessionId: this.#sessionId, epoch }, [port2])
	}

	#reconnect(epoch: number) {
		if (this.#closed) return
		this.#epoch = epoch
		const error = new Error('Database owner changed. An in-flight write may have committed; it was not retried. Query snapshots are reconnecting.')
		for (const reject of [...this.#pending]) reject(error)
		this.#port.close()
		const { port1, port2 } = new MessageChannel()
		this.#port = port1
		this.#remote = Comlink.wrap<WorkerApi>(port1)
		port1.start()
		this.#control?.postMessage({ type: 'attach', sessionId: this.#sessionId, epoch: this.#epoch }, [port2])
		this.#observing = false
		this.#ready = this.#initialize(this.#remote.ready())
		void this.#ready.catch(failure => this.#fail(report(failure)))
		for (const query of this.#queries.values()) query.reconnect()
	}

	#request<T>(operation: Promise<T>): Promise<T> {
		if (this.#failure) return Promise.reject(this.#failure)
		if (this.#closed) return Promise.reject(new Error('Database is closed'))
		return new Promise((resolve, reject) => {
			const fail = (error: Error) => { clearTimeout(timer); this.#pending.delete(fail); reject(error) }
			const timer = setTimeout(() => this.#fail(new Error('Database operation timed out. A write may have committed before its response was lost; it was not retried.')), this.#timeoutMs)
			this.#pending.add(fail)
			operation.then(value => { clearTimeout(timer); this.#pending.delete(fail); resolve(value) }, error => { clearTimeout(timer); this.#pending.delete(fail); reject(error) })
		})
	}

	async execute(sql: string, params: readonly SqlValue[] = []): Promise<QueryResult> {
		this.#checkOpen()
		const statement = { sql, params: params.map(copyValue) }
		await this.ready
		this.#checkOpen()
		return this.#request(this.#remote.execute(statement))
	}
	async batch(statements: readonly Statement[]): Promise<QueryResult[]> {
		this.#checkOpen()
		const captured = statements.map(statement => ({ sql: statement.sql, params: statement.params?.map(copyValue) }))
		await this.ready
		this.#checkOpen()
		return this.#request(this.#remote.batch(captured))
	}
	liveQuery(sql: string, params: readonly SqlValue[] = []): LiveQuery { return this.#query({ sql, params: params.map(copyValue) }) }
	liveTable(table: string): LiveQuery { return this.#query({ table }) }
	#query(spec: QuerySpec) { this.#checkOpen(); return this.#queries.get(cacheKey(spec)) ?? new ClientQuery(this, spec) }
	addQuery(spec: QuerySpec, query: ClientQuery) { this.#queries.set(cacheKey(spec), query) }
	removeQuery(spec: QuerySpec, query: ClientQuery) { if (this.#queries.get(cacheKey(spec)) === query) this.#queries.delete(cacheKey(spec)) }
	async watch(id: string, spec: QuerySpec, listener: (update: WireUpdate) => void) { await this.ready; this.#checkOpen(); return this.#request(this.#remote.watch(id, spec, Comlink.proxy(listener))) }
	async unwatch(id: string) { if (!id) return; try { await this.ready; await this.#request(this.#remote.unwatch(id)) } catch { /* Closing already releases every worker subscription. */ } }
	subscribeEvents(listener: (event: DatabaseEvent) => void): Unsubscribe {
		this.#checkOpen()
		this.#observers.add(listener)
		void this.ready.then(() => { if (this.#observers.size) return this.#observe() }).catch(() => {})
		return () => {
			this.#observers.delete(listener)
			if (this.#observers.size || !this.#observing || this.#closed) return
			this.#observing = false
			void this.#request(this.#remote.unobserve()).catch(() => {})
		}
	}
	async inspect(): Promise<Inspection> { this.#checkOpen(); await this.ready; this.#checkOpen(); return this.#request(this.#remote.inspect()) }
	async exportDatabase(): Promise<Uint8Array> { this.#checkOpen(); await this.ready; this.#checkOpen(); return this.#request(this.#remote.exportDatabase()) }

	#checkOpen() { if (this.#closed) throw this.#failure ?? new Error('Database is closed') }

	#fail(error: Error) {
		if (this.#failure || this.#closed) return
		this.#failure = error
		for (const reject of [...this.#pending]) reject(error)
		for (const query of this.#queries.values()) query.fail(error)
		for (const listener of this.#observers) deliver(listener, { kind: 'error', message: error.message })
		this.close()
	}
	close() {
		if (this.#closed) return
		this.#closed = true
		const error = this.#failure ?? new Error('Database is closed')
		for (const reject of [...this.#pending]) reject(error)
		for (const query of this.#queries.values()) query.fail(error)
		this.#queries.clear()
		this.#observers.clear()
		void this.#remote.disconnect().catch(() => {})
		this.#remote[Comlink.releaseProxy]()
		this.#port.close()
		this.#control?.close()
		this.#worker?.terminate()
		this.#releaseSession()
	}
}

function uniqueColumns(columns: string[]): string[] {
	const seen = new Set<string>()
	return columns.map(column => {
		let name = column
		let suffix = 1
		while (seen.has(name)) name = `${column}_${++suffix}`
		seen.add(name)
		return name
	})
}

function copyValue(value: SqlValue): SqlValue {
	if (value === null || typeof value === 'string' || typeof value === 'bigint') return value
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (value instanceof Uint8Array) return value.slice()
	throw new TypeError('SQL parameters must be null, text, finite numbers, bigint or Uint8Array')
}
