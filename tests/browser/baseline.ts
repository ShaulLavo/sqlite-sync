import * as Comlink from 'comlink'
import type { Api } from '../../benchmarks/legacy/worker'

export async function baseline() {
	const worker = new Worker(new URL('../../benchmarks/legacy/worker.ts', import.meta.url), { type: 'module' })
	const api = Comlink.wrap<Api>(worker)
	try {
		await Promise.race([api.clientReady,new Promise<never>((_,reject)=>{worker.addEventListener('error',event=>reject(new Error(event.message)));setTimeout(()=>reject(new Error('Legacy initialization timed out')),10000)})])
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

export async function seedLegacy() {
	const worker = new Worker(new URL('../../benchmarks/legacy/worker.ts', import.meta.url), {type:'module'})
	const api = Comlink.wrap<Api>(worker)
	try {
		await api.clientReady
		await api.driver("INSERT INTO users(id,name,email,picture,bio,location,created_at,is_active) VALUES(100,'Legacy','legacy@persist','pic','bio','place','old',1)")
		await api.driver('INSERT INTO cells VALUES(3,4,1)')
	} finally { worker.terminate() }
}
