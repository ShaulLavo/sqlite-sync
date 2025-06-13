import { and, eq } from 'drizzle-orm'
import { createSignal, For, onCleanup, onMount } from 'solid-js'
import { useDb } from '../context/DbProvider'
import { useCells } from '../hooks/useCells'
import * as schema from '../sqlite/schema'
import { shuffleArray } from '../utils/array'
import Button from './ui/Button'

export function GameOfLife() {
	const [cells] = useCells()
	const { db, api } = useDb()
	const [running, setRunning] = createSignal(false)
	let timeoutId: ReturnType<typeof setTimeout>

	const sorted = () =>
		cells.toSorted((a, b) => (a.y! === b.y! ? a.x! - b.x! : a.y! - b.y!))

	async function step() {
		const database = await db
		const current = await database.select().from(schema.cells).all()

		const aliveSet = new Set(
			current.filter(c => c.alive).map(c => `${c.x},${c.y}`)
		)

		const neighborCounts = new Map<string, number>()
		for (const key of aliveSet) {
			const [x, y] = key.split(',').map(Number)
			for (let dx = -1; dx <= 1; dx++) {
				for (let dy = -1; dy <= 1; dy++) {
					if (dx || dy) {
						const nk = `${x + dx},${y + dy}`
						neighborCounts.set(nk, (neighborCounts.get(nk) || 0) + 1)
					}
				}
			}
		}
		let shouldShuffle = false
		if (shouldShuffle) shuffleArray(current)

		const queries: any = []
		for (const { x, y, alive } of current) {
			const key = `${x},${y}`
			const n = neighborCounts.get(key) || 0
			const nextAlive = (alive && n === 2) || n === 3
			if (nextAlive !== alive) {
				queries.push(
					database
						.update(schema.cells)
						.set({ alive: nextAlive })
						.where(and(eq(schema.cells.x, x!), eq(schema.cells.y, y!)))
				)
			}
		}

		await database.batch(queries)
		timeoutId = setTimeout(runLoop, 0)
	}

	function runLoop() {
		if (!running()) return
		step().catch(err => {
			console.error(err)
		})
	}
	function toggleRun() {
		if (!running()) {
			setRunning(true)
			runLoop()
		} else {
			setRunning(false)
			clearTimeout(timeoutId)
		}
	}

	onCleanup(() => clearTimeout(timeoutId))

	onMount(async () => {
		await api.clientReady
		const database = await db

		await database.update(schema.cells).set({ alive: false }).run()
		const all = await database.select().from(schema.cells).all()
		const maxX = Math.max(...all.map(c => c.x!))
		const maxY = Math.max(...all.map(c => c.y!))
		const promises: any = []
		for (let y = 0; y <= maxY; y += 4) {
			for (let x = 0; x <= maxX; x += 4) {
				for (let dx = 0; dx < 3; dx++) {
					promises.push(
						database
							.update(schema.cells)
							.set({ alive: true })
							.where(and(eq(schema.cells.x, x + dx), eq(schema.cells.y, y)))
					)
				}
			}
		}
		if (promises.length === 0) return

		await database.batch(promises)
	})

	return (
		<div>
			<Button type="button" onClick={toggleRun}>
				{running() ? 'Stop' : 'Start'}
			</Button>
			<div
				class="grid gap-px mt-2"
				style={{
					'grid-template-columns': `repeat(${
						Math.max(...cells.map(c => c.x!)) + 1
					}, 12px)`
				}}
			>
				<For each={sorted()}>
					{cell => (
						<div
							onClick={async () => {
								const database = await db
								await database
									.update(schema.cells)
									.set({ alive: !cell.alive })
									.where(
										and(
											eq(schema.cells.x, cell.x!),
											eq(schema.cells.y, cell.y!)
										)
									)
									.run()
							}}
							class={`w-3 h-3 cursor-pointer ${
								cell.alive ? 'bg-red-500' : 'bg-green-500'
							}`}
						/>
					)}
				</For>
			</div>
		</div>
	)
}
