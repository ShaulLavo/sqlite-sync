import { and, eq } from 'drizzle-orm'
import { createSignal, For, onCleanup, onMount } from 'solid-js'
import { useDb } from '../context/DbProvider'
import { useCells } from '../hooks/useCells'
import * as schema from '../sqlite/schema'

export function GameOfLife() {
	const cells = useCells()
	const { db } = useDb()
	const [running, setRunning] = createSignal(false)

	let timer: ReturnType<typeof setInterval>
	const sorted = () =>
		cells.toSorted((a, b) => (a.y! === b.y! ? a.x! - b.x! : a.y! - b.y!))

	async function step() {
		const database = await db

		const current = await database.select().from(schema.cells).all()

		const aliveSet = new Set(
			current.filter(c => c.alive).map(c => `${c.x},${c.y}`)
		)
		const neighborCounts = new Map<string, number>()
		aliveSet.forEach(key => {
			const [x, y] = key.split(',').map(Number)
			for (let dx = -1; dx <= 1; dx++) {
				for (let dy = -1; dy <= 1; dy++) {
					if (dx || dy) {
						const nk = `${x + dx},${y + dy}`
						neighborCounts.set(nk, (neighborCounts.get(nk) || 0) + 1)
					}
				}
			}
		})

		const updates: Promise<any>[] = []
		for (const { x, y, alive } of current) {
			const key = `${x},${y}`
			const n = neighborCounts.get(key) || 0
			const nextAlive = alive ? n === 2 || n === 3 : n === 3
			if (nextAlive !== alive) {
				updates.push(
					database
						.update(schema.cells)
						.set({ alive: nextAlive })
						.where(and(eq(schema.cells.x, x!), eq(schema.cells.y, y!)))
						.run()
				)
			}
		}

		for await (const updPromise of updates) {
			await updPromise
		}
	}

	function toggleRun() {
		if (!running()) {
			timer = setInterval(step, 300)
		} else {
			window.clearInterval(timer)
		}
		setRunning(r => !r)
	}

	onCleanup(() => window.clearInterval(timer))
	onMount(async () => {
		const database = await db
		// clear everything first
		await database.update(schema.cells).set({ alive: false }).run()

		// figure out grid bounds
		const all = await database.select().from(schema.cells).all()
		const maxX = Math.max(...all.map(c => c.x!))
		const maxY = Math.max(...all.map(c => c.y!))

		const promises: Promise<any>[] = []
		for (let y = 0; y <= maxY; y += 4) {
			for (let x = 0; x <= maxX; x += 4) {
				for (let dx = 0; dx < 3; dx++) {
					promises.push(
						database
							.update(schema.cells)
							.set({ alive: true })
							.where(and(eq(schema.cells.x, x + dx), eq(schema.cells.y, y)))
							.run()
					)
				}
			}
		}
		await Promise.all(promises)
	})
	return (
		<div>
			<button type="button" onClick={toggleRun}>
				{running() ? 'Stop' : 'Start'}
			</button>
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
