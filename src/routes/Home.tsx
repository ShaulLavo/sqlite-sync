import * as Comlink from 'comlink'
import { onCleanup, onMount, type Component } from 'solid-js'
import { GameOfLife } from '../components/GameOfLife'
import { ManageUsers } from '../components/Users/ManageUsers'
import { useDb } from '../context/DbProvider'
import * as schema from '../sqlite/schema'
import { downloadDatabase } from '../utils/download'
import { ChangeLogTable } from '../components/ChangeLog'
import { GameOfLifeCanvas } from '../components/GameOfLifeCanvas'

const Home: Component = () => {
	const { api, db } = useDb()
	onMount(async () => {
		api.subscribeToTable(
			'changeLog',
			Comlink.proxy(change => {
				console.log('Change detected in chagelog table:', change)
			})
		)
		api.subscribeToTable(
			'users',
			Comlink.proxy(change => {
				console.log('Change detected in users table:', change)
			})
		)

		// runBatchExample(db())
		onCleanup(async () => {})
		// api.subscribeToTable('users', onChange)
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
					onClick={async () => await downloadDatabase(api)}
				>
					Download DB
				</button>
				<button
					class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200 shadow-md text-base leading-relaxed mb-6"
					onClick={async () => (await db).delete(schema.changeLog)}
				>
					`` Clear ChangeLog
				</button>
				{/* <GameOfLife /> */}
				<GameOfLifeCanvas />
				<ManageUsers />
			</div>
		</div>
	)
}

export default Home
