import * as Comlink from 'comlink'
import { drizzle, SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { createSignal, onCleanup, onMount, type Component } from 'solid-js'
import { ChangeLogTable } from './components/ChangeLog'
import { Data } from './components/Data'
import { ManageUsers } from './components/Users/ManageUsers'
import type { Api, ChangeCallback } from './sqlite'
import * as schema from './sqlite/schema'
import { getDrizzleDriver } from './utils/drizzleDriver'

const worker = new Worker(new URL('./sqlite/index.ts', import.meta.url), {
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
//TODO move this to a context or something
const [db, setDb] = createSignal<SqliteRemoteDatabase<typeof schema>>(null!)
const { driver, batchDriver } = getDrizzleDriver(api)
const drizz = drizzle<typeof schema>(driver, batchDriver)

setDb(drizz)

async function downloadLocalDB() {
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

const App: Component = () => {
	onMount(async () => {
		const onChange: ChangeCallback = change => {
			console.log('Change detected in users table:', change)
		}
		const unsubscribe = await api.subscribeToAllChangesInTable(
			'users',
			Comlink.proxy(onChange)
		)
		onCleanup(async () => unsubscribe())
		// api.subscribeToAllChangesInTable('users', onChange)
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
				<button
					class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200 shadow-md text-base leading-relaxed mb-6"
					onClick={downloadLocalDB}
				>
					Download DB
				</button>
				<ManageUsers db={db()} />
				<ChangeLogTable />
				<Data db={db()} />
			</div>
		</div>
	)
}

export default App
