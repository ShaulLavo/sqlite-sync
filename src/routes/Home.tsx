import {
	type Component,
	createEffect,
	createSignal,
	on,
	onMount,
	type Signal
} from 'solid-js'
import { GameOfLifeCanvas } from '../components/GameOfLifeCanvas'
import { ChangeLogTable } from '../components/ChangeLog'
import { ManageUsers } from '../components/Users/ManageUsers'
import { MoonIcon, SunIcon } from '../components/icons/ThemeIcons'
import { makePersisted } from '@solid-primitives/storage'
import { Logo } from '../components/Logo'
import { useDb } from '../context/DbProvider'
import type { ChangeCallback } from '../sqlite'
import * as Comlink from 'comlink'
import type { ChangeLog } from '../sqlite/schema'
import ky from 'ky'
import { createBatchFlusher } from '../utils/createBatchFlusher'
import { setupWebsocket } from '../sync/socket'
export const [isDarkMode, setIsDarkMode] = makePersisted(
	createSignal(window.matchMedia('(prefers-color-scheme: dark)').matches)
)
const Home: Component = () => {
	createEffect(() => {
		document.documentElement.classList.toggle('dark', isDarkMode())
	})
	const { api, db } = useDb()
	const toggleDarkMode = () => {
		setIsDarkMode(prev => !prev)
	}

	onMount(async () => {
		// const database = await db
		// await setupWebsocket(database)
		// const sendToServer = async (incoming: ChangeLog[]) => {
		// 	const res = await ky
		// 		.post('http://localhost:3000/', {
		// 			timeout: 10_000,
		// 			json: incoming
		// 		})
		// 		.json()
		// 	console.log(res)
		// }
		// const onChange = createBatchFlusher(sendToServer, 500)
		// await api.subscribeToChangeLog(Comlink.proxy(onChange))
	})
	return (
		<div class="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors duration-300">
			<div class="container mx-auto px-4 py-8">
				<header class="mb-8">
					<div class="flex justify-between items-center">
						<h1 class="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-500 dark:from-purple-400 dark:to-pink-300">
							Reactive SQLite Demo
						</h1>
						<button
							onClick={toggleDarkMode}
							class="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200"
							aria-label={
								isDarkMode() ? 'Switch to light mode' : 'Switch to dark mode'
							}
						>
							{isDarkMode() ? <SunIcon /> : <MoonIcon />}
						</button>
					</div>
					<p class="mt-2 text-lg text-gray-600 dark:text-gray-300">
						A demonstration of SQLite in a Web Worker with Solid.js
					</p>
				</header>

				<div class="grid gap-8">
					<section class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-all duration-300 hover:shadow-xl">
						<h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
							Game of Life Simulation
						</h2>
						<GameOfLifeCanvas />
					</section>

					<section class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-all duration-300 hover:shadow-xl">
						<h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
							Database Change Log
						</h2>
						<ChangeLogTable />
					</section>

					<section class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transition-all duration-300 hover:shadow-xl">
						<h2 class="text-2xl font-bold text-gray-800 dark:text-white mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
							User Management
						</h2>
						<ManageUsers />
					</section>
				</div>
			</div>
		</div>
	)
}

export default Home
function makePersistent(arg0: Signal<boolean>): [any, any] {
	throw new Error('Function not implemented.')
}
