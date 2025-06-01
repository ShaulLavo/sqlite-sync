import * as Comlink from 'comlink'
import { drizzle, SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { createSignal, onMount, type Component } from 'solid-js'
import { Tables } from './components/Tabels'
import type { Api } from './sqliteWorker'
import { getDrizzleDriver } from './utils/drizzleDriver'
import * as schema from './schema'
const worker = new Worker(new URL('./sqliteWorker.ts', import.meta.url), {
	type: 'module'
})
export const api = Comlink.wrap<Api>(worker)
export const hasOPFS = async () => {
	if (
		typeof navigator !== 'object' ||
		!navigator.storage ||
		typeof (navigator as any).storage.getDirectory !== 'function'
	) {
		return false
	}

	try {
		await navigator.storage.getDirectory()
		return true
	} catch {
		return false
	}
}
export const isPersisted = async (): Promise<boolean> =>
	!!(navigator.storage && (await navigator.storage.persisted()))

const App: Component = () => {
	const [db, setDb] = createSignal<SqliteRemoteDatabase<typeof schema>>(null!)
	onMount(async () => {
		try {
			const { driver, batchDriver } = await getDrizzleDriver(api)
			setDb(drizzle<typeof schema>(driver, batchDriver))
		} catch (err) {
			console.error('Error initializing database:', err)
		}
	})
	return (
		<div class="min-h-screen flex justify-center bg-gray-50 px-4">
			<div class=" w-full bg-white p-8 ">
				<h1 class="text-3xl font-bold text-gray-800 mb-4">
					SQLite Worker Example
				</h1>
				<p class="text-base text-gray-600 leading-relaxed mb-6">
					This example demonstrates using SQLite in a Web Worker with Solid.js.
				</p>
				<Tables db={db()} />
				{/* <WorkerStatus /> */}
			</div>
		</div>
	)
}

export default App
