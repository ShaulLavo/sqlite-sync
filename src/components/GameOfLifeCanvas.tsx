import { and, eq, sql } from 'drizzle-orm'
import { createEffect, createSignal, on, onCleanup, onMount } from 'solid-js'
import { useDb } from '../context/DbProvider'
import { generateDemoBoard, useCells } from '../hooks/useCells'
import * as schema from '../sqlite/schema'
import { shuffleArray } from '../utils/array'
import Button from './ui/Button'
import { defaultAlive } from '../consts/defaultCells'
import { debounce } from '@solid-primitives/scheduled'
export function GameOfLifeCanvas() {
	const gridSize = { width: 45, height: 5 }

	const [cells, lastChanges] = useCells({ ...gridSize })
	const { db } = useDb()
	const [running, setRunning] = createSignal(false)
	let timeoutId: ReturnType<typeof setTimeout>
	let canvasRef: HTMLCanvasElement | undefined
	const cellSize = 20

	// Determine grid dimensions based on cell coordinates
	const gridWidth = () =>
		cells.length ? Math.max(...cells.map(c => c.x!)) + 1 : 0
	const gridHeight = () =>
		cells.length ? Math.max(...cells.map(c => c.y!)) + 1 : 0

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
		let shouldShuffle = false
		if (shouldShuffle) shuffleArray(current)

		const updates: any = []
		for (const { x, y, alive } of current) {
			const key = `${x},${y}`
			const n = neighborCounts.get(key) || 0
			const nextAlive = (alive && n === 2) || n === 3
			if (nextAlive !== alive) {
				updates.push(
					database
						.update(schema.cells)
						.set({ alive: nextAlive })
						.where(and(eq(schema.cells.x, x!), eq(schema.cells.y, y!)))
				)
			}
		}
		await database.batch(updates)
		// await Promise.all(updates.map((u: any) => u.run()))
		// updates.forEach(async (u: any) => await u.run())
		timeoutId = setTimeout(runLoop, 0)
	}

	function runLoop() {
		if (!running()) return
		step().catch(err => {
			console.error(err)
			setRunning(false)
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

	function handleClick(evt: MouseEvent) {
		if (!canvasRef) return
		const rect = canvasRef.getBoundingClientRect()
		const x = Math.floor((evt.clientX - rect.left) / cellSize)
		const y = Math.floor((evt.clientY - rect.top) / cellSize)
		db.then(
			async database =>
				await database
					.update(schema.cells)
					.set({
						alive: sql`NOT ${schema.cells.alive}`
					})
					.where(and(eq(schema.cells.x, x), eq(schema.cells.y, y)))
					.run()
		)
	}

	createEffect(() => {
		if (lastChanges().length) return
		if (!canvasRef) return
		const w = gridWidth()
		const h = gridHeight()
		canvasRef.width = w * cellSize
		canvasRef.height = h * cellSize
		const ctx = canvasRef.getContext('2d')!
		ctx.clearRect(0, 0, w * cellSize, h * cellSize)
		cells.forEach(cell => {
			ctx.fillStyle = cell.alive ? '#ffb3c1' : '#a8dadc'
			ctx.fillRect(
				cell.x! * cellSize,
				cell.y! * cellSize,
				cellSize - 1,
				cellSize - 1
			)
		})
	})

	async function clearGrid() {
		const database = await db
		await database.update(schema.cells).set({ alive: false }).run()
	}
	async function seedDemo() {
		const database = await db
		const pattern = generateDemoBoard(gridSize.width, gridSize.height)
		const aliveMap = new Set(
			pattern.filter(cell => cell.alive).map(cell => `${cell.x},${cell.y}`)
		)
		// Construct the full board with correct alive status
		const updates = []
		for (let y = 0; y < gridSize.height; y++) {
			for (let x = 0; x < gridSize.width; x++) {
				updates.push({
					x,
					y,
					alive: aliveMap.has(`${x},${y}`)
				})
			}
		}
		const queries = updates.map(cell =>
			database
				.update(schema.cells)
				.set({ alive: cell.alive })
				.where(and(eq(schema.cells.x, cell.x), eq(schema.cells.y, cell.y)))
		)
		await database.batch(queries as any)
	}
	const resetDemo = debounce(seedDemo, 200)

	createEffect(
		on(lastChanges, changes => {
			if (!canvasRef) return

			const ctx = canvasRef.getContext('2d')!

			for (const change of changes) {
				const { x, y, alive } = JSON.parse(change.row_json) as {
					x: number
					y: number
					alive: 0 | 1
				}
				const px = x * cellSize
				const py = y * cellSize
				ctx.fillStyle = alive ? '#ffb3c1' : '#a8dadc'
				ctx.fillRect(px, py, cellSize - 1, cellSize - 1)
			}
		})
	)

	onMount(() => {
		if (!canvasRef) return
		const handler = (evt: MouseEvent) => handleClick(evt)
		canvasRef.addEventListener('click', handler)
		onCleanup(() => canvasRef?.removeEventListener('click', handler))
	})

	onCleanup(() => clearTimeout(timeoutId))

	return (
		<div>
			<Button onClick={toggleRun}>{running() ? 'Stop' : 'Start'}</Button>
			<Button onClick={clearGrid}>Clear</Button>
			<Button onClick={resetDemo}>Reset Demo</Button>
			<canvas ref={canvasRef} class="border border-gray-300 mt-2" />
		</div>
	)
}
