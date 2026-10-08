import * as Comlink from 'comlink'
import type { Api } from '../../src/sqlite'

export async function baseline() {
	const worker = new Worker(new URL('../../benchmarks/legacy/worker.ts', import.meta.url), { type: 'module' })
	const api = Comlink.wrap<Api>(worker)
	try {
		await api.clientReady
		const events: string[] = []
		await api.subscribeToTable('users', Comlink.proxy(changes => events.push(...changes.map(c => c.op_type))))
		const start = performance.now()
		await api.batchDriver([
			{ sql: "INSERT INTO users(name,email) VALUES('baseline','baseline@test')" },
			{ sql: "UPDATE users SET name='updated' WHERE email='baseline@test'" },
			{ sql: "DELETE FROM users WHERE email='baseline@test'" }
		])
		await new Promise(resolve => setTimeout(resolve, 25))
		return { events, mutationMs: performance.now() - start, ready: true }
	} finally {
		worker.terminate()
	}
}
