import { captureStoreUpdates, trackStore } from '@solid-primitives/deep'
import { debounce, leading } from '@solid-primitives/scheduled'
import { makePersisted } from '@solid-primitives/storage'
import * as Comlink from 'comlink'
import { batch, createEffect, createSignal, onMount } from 'solid-js'
import { createStore, produce, reconcile } from 'solid-js/store'
import { defaultCells } from '../consts/defaultCells'
import { useDb } from '../context/DbProvider'
import { cells as cellsSchema, type ChangeLog } from '../sqlite/schema'

export type Cell = { x: number; y: number; alive: boolean }

export function generateDemoBoard(width: number, height: number): Cell[] {
	const aliveMap = new Set<string>()

	const xStart = 2
	const xEnd = width - 2
	const rowSpacing = 4

	const minY = 2
	const maxY = height - 2

	// Step 1: Mark alive cells into a Set
	for (let y = minY; y <= maxY; y += rowSpacing) {
		let x = xStart

		while (x + 2 <= xEnd) {
			// 3 alive cells
			for (let i = 0; i < 3; i++) {
				aliveMap.add(`${x + i},${y}`)
			}

			x += 3

			// 1 dead spacer if enough room
			if (x + 3 <= xEnd) {
				x += 1
			} else {
				break
			}
		}
	}

	// Step 2: Build full board, using aliveMap to flag cells
	const result: Cell[] = []

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			result.push({
				x,
				y,
				alive: aliveMap.has(`${x},${y}`)
			})
		}
	}

	return result
}
export const generateEmptyBoard = (width: number, height: number): Cell[] =>
	Array.from({ length: width * height }, (_, i) => ({
		x: i % width,
		y: Math.floor(i / width),
		alive: false
	}))
interface useCellProps {
	width?: number
	height?: number
}

export function useCells(props: useCellProps = {}) {
	const width = props.width ?? 50
	const height = props.height ?? 30

	const [cells, setCells] = createStore<Cell[]>(
		generateEmptyBoard(width, height)
	)
	const [lastChanges, setLastChanges] = createSignal<ChangeLog[]>([])

	const { db, api } = useDb()
	onMount(async () => {
		const database = await db

		let existing = await database.select().from(cellsSchema).all()

		const total = width * height
		if (existing.length !== total) {
			await database.delete(cellsSchema).run()
			let batch: Cell[] = []
			for (let x = 0; x < width; x++) {
				for (let y = 0; y < height; y++) {
					batch.push({ x, y, alive: false })
				}
			}

			if (!batch.length) return
			await database.insert(cellsSchema).values(batch).run()

			const fresh = await database.select().from(cellsSchema).all()
			setCells(fresh)
		} else {
			setCells(existing)
		}
	})
	onMount(async () => {
		await api.subscribeToTable(
			'cells',
			Comlink.proxy((changes: ChangeLog[]) => {
				setLastChanges(changes)
			})
		)
	})

	return [cells, lastChanges] as const
}
