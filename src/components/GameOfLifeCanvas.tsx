import { and, eq, sql } from 'drizzle-orm'
import {
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
	onMount
} from 'solid-js'
import { useDb } from '../context/DbProvider'
import { generateDemoBoard, useCells, type Cell } from '../hooks/useCells'
import * as schema from '../sqlite/schema'
import { shuffleArray } from '../utils/array'
import Button from './ui/Button'
import { isDarkMode } from '../routes/Home'

export function GameOfLifeCanvas() {
	const gridSize = { width: 50, height: 10 }
	const cellSize = 20

	const [cells, lastChanges, loading] = useCells({ ...gridSize })
	const { db } = useDb()
	const [running, setRunning] = createSignal(false)
	let timeoutId: ReturnType<typeof setTimeout>
	let canvasRef!: HTMLCanvasElement
	const aliveColor = createMemo(() =>
		isDarkMode() ? 'rgb(219, 39, 119)' : 'rgb(236, 72, 153)'
	)
	const deadColor = createMemo(() =>
		isDarkMode() ? 'rgb(30, 41, 59)' : 'rgb(243, 244, 246)'
	)
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
		const shouldShuffle = false
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
		timeoutId = setTimeout(runLoop, 1)
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
		await database.batch(
			updates.map(cell =>
				database
					.update(schema.cells)
					.set({ alive: cell.alive })
					.where(and(eq(schema.cells.x, cell.x), eq(schema.cells.y, cell.y)))
			) as any
		)
	}

	createEffect(
		on(isDarkMode, () => {
			fullDraw(canvasRef.getContext('2d')!)
		})
	)

	async function fullDraw(ctx: CanvasRenderingContext2D) {
		const w = gridWidth(),
			h = gridHeight()
		canvasRef!.width = w * cellSize
		canvasRef!.height = h * cellSize
		ctx.clearRect(0, 0, w * cellSize, h * cellSize)
		const database = await db
		const cells = await database.select().from(schema.cells).all()
		cells.forEach(({ x, y, alive }) => {
			ctx.fillStyle = alive ? aliveColor() : deadColor()
			ctx.fillRect(x! * cellSize, y! * cellSize, cellSize - 1, cellSize - 1)
		})
	}
	let initialized = false

	createEffect(
		on(lastChanges, async changes => {
			if (!canvasRef) return
			const ctx = canvasRef.getContext('2d')!
			const total = gridSize.width * gridSize.height
			if (!initialized) {
				await fullDraw(ctx)
				initialized = true
				return
			}

			// big batch? full redraw
			if (changes.length > total / 2) {
				await fullDraw(ctx)
				return
			}

			// otherwise patch diffs
			for (const change of changes) {
				const { x, y, alive } = JSON.parse(change.row_json) as {
					x: number
					y: number
					alive: 0 | 1
				}
				ctx.fillStyle = alive ? aliveColor() : deadColor()
				ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1)
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
		<div class="relative">
			<div class="flex flex-wrap gap-3 mb-4">
				<Button
					onClick={toggleRun}
					disabled={loading()}
					class="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white"
				>
					{running() ? 'Stop Simulation' : 'Start Simulation'}
				</Button>
				<Button
					onClick={clearGrid}
					disabled={loading()}
					class="bg-gray-700 hover:bg-gray-600 text-white"
				>
					Clear Grid
				</Button>
				<Button
					onClick={seedDemo}
					disabled={loading()}
					class="bg-gray-700 hover:bg-gray-600 text-white"
				>
					Reset Demo
				</Button>
			</div>
			{/* {loading() && (
				<div class="flex justify-center items-center h-40">
					<div class="animate-pulse text-purple-600 dark:text-purple-400 ">
						Loading simulation...
					</div>
				</div>
			)} */}
			<div class="overflow-hidden rounded-lg shadow-lg">
				<canvas
					ref={canvasRef}
					class="border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 rounded-lg transition-all duration-300"
				/>
			</div>
		</div>
	)
}
