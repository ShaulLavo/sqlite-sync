import * as Comlink from 'comlink'
import { createEngine } from './storage'
import type { ReactiveEngine } from './engine'
import type { DatabaseOptions, WorkerApi, WireListener, DatabaseEvent } from './types'

let initialization: Promise<ReactiveEngine> | undefined
let configuration = ''
const sessions = new Map<string, { close: () => void }>()

function start(options: DatabaseOptions): Promise<ReactiveEngine> {
	const config = JSON.stringify(options, (_, value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)
	if (initialization && configuration !== config) return Promise.reject(new Error('This database is already open with different options. Close all clients before changing its configuration.'))
	if (initialization) return initialization
	configuration = config
	initialization = new Promise((resolve, reject) => {
		if (!navigator.locks) { reject(new Error('Web Locks are required for safe database ownership')); return }
		void navigator.locks.request(`sqlite-sync-owner:${options.name ?? 'local.db'}`, { ifAvailable: options.ownership === 'exclusive' }, async lock => {
			if (!lock) throw new Error('Database is in use by another owner. Use shared ownership or close the other tab.')
			const engine = await createEngine(options)
			resolve(engine)
			await new Promise<void>(() => {})
		}).catch(reject)
	})
	void initialization.catch(() => {})
	return initialization
}

function releaseCallback(callback: object) {
	const release: unknown = Reflect.get(callback, Comlink.releaseProxy)
	if (typeof release === 'function') release()
}

function attach(sessionId: string, port: MessagePort, options: DatabaseOptions) {
	const ready = start(options)
	const callbacks = new Map<string, WireListener>()
	let observer: ((event: DatabaseEvent) => void | Promise<void>) | undefined
	let closed = false
	const engine = async () => {
		if (closed) throw new Error('Database session is closed')
		const result = await ready
		if (closed) throw new Error('Database session is closed')
		return result
	}
	const unwatch = async (id: string) => {
		const callback = callbacks.get(id)
		callbacks.delete(id)
		const database = await ready
		database.unwatch(`${sessionId}:${id}`)
		if (callback) releaseCallback(callback)
	}
	const disconnect = () => {
		if (closed) return
		closed = true
		sessions.delete(sessionId)
		void ready.then(database => {
			for (const id of callbacks.keys()) database.unwatch(`${sessionId}:${id}`)
			database.unobserve(sessionId)
			for (const callback of callbacks.values()) releaseCallback(callback)
			callbacks.clear()
			if (observer) releaseCallback(observer)
		}).catch(() => {})
	}
	const api: WorkerApi = {
		ready: async () => { await engine() },
		execute: async statement => (await engine()).execute(statement),
		batch: async statements => (await engine()).batch(statements),
		watch: async (id, spec, listener) => {
			const database = await engine()
			if (callbacks.has(id)) await unwatch(id)
			callbacks.set(id, listener)
			try { database.watch(`${sessionId}:${id}`, spec, listener) }
			catch (error) { callbacks.delete(id); releaseCallback(listener); throw error }
		},
		unwatch,
		observe: async listener => {
			const database = await engine()
			if (observer) releaseCallback(observer)
			observer = listener
			database.observe(sessionId, listener)
		},
		unobserve: async () => {
			const database = await engine()
			database.unobserve(sessionId)
			if (observer) releaseCallback(observer)
			observer = undefined
		},
		inspect: async () => (await engine()).inspect(sessions.size),
		exportDatabase: async () => {
			const database = await engine()
			return database.sqlite3.capi.sqlite3_js_db_export(database.db)
		},
		disconnect: async () => { disconnect() }
	}
	sessions.set(sessionId, { close: disconnect })
	port.start()
	Comlink.expose(api, port)
}

function handleMessage(event: MessageEvent) {
	const data = event.data
	if (data?.type === 'connect' && typeof data.sessionId === 'string' && event.ports[0]) attach(data.sessionId, event.ports[0], data.options)
	if (data?.type === 'disconnect' && typeof data.sessionId === 'string') sessions.get(data.sessionId)?.close()
}

self.addEventListener('message', event => {
	if (event.data?.type !== 'broker' || !event.ports[0]) { handleMessage(event); return }
	const control = event.ports[0]
	control.addEventListener('message', handleMessage)
	control.start()
})
