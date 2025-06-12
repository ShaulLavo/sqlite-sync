import { type Component } from 'solid-js'
import { ChangeLogTable } from '../components/ChangeLog'
import { GameOfLifeCanvas } from '../components/GameOfLifeCanvas'
import { ManageUsers } from '../components/Users/ManageUsers'

const Home: Component = () => {
	return (
		<div class="min-h-screen flex justify-center bg-gray-50 px-4">
			<div class=" w-full bg-white p-8 ">
				<h1 class="text-3xl font-bold text-gray-800 mb-4">
					Reactive SQLite Example
				</h1>
				<p class="text-base text-gray-600 leading-relaxed mb-6">
					This example demonstrates using SQLite in a Web Worker with Solid.js.
				</p>

				<GameOfLifeCanvas />
				{/* <ChangeLogTable /> */}
				{/* <ManageUsers /> */}
			</div>
		</div>
	)
}

export default Home
