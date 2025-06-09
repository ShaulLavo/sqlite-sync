import * as Comlink from 'comlink'
import { batch, onMount } from 'solid-js'
import { createStore, produce, reconcile } from 'solid-js/store'
import { useDb } from '../context/DbProvider'
import { cells as cellsSchema } from '../sqlite/schema'
import { type ChangeLog } from '../sqlite/schema'
import { makePersisted } from '@solid-primitives/storage'
export type Cell = { x: number; y: number; alive: boolean }

interface useCellProps {
	width?: number
	height?: number
}
export function useCells({ width = 50, height = 30 }: useCellProps = {}) {
	const initial: Cell[] = []
	for (let x = 0; x < width; x++) {
		for (let y = 0; y < height; y++) {
			// Create a simple repeating block pattern
			const isAlive = y % 4 === 1 && x % 4 < 3
			initial.push({ x, y, alive: isAlive })
		}
	}
	const [cells, setCells] = makePersisted(createStore<Cell[]>(initial), {
		name: 'game-of-life-cells'
	})

	const { db, api } = useDb()
	onMount(async () => {
		const database = await db

		const existing = await database.select().from(cellsSchema).all()

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

		await api.subscribeToTable(
			'cells',
			Comlink.proxy((changes: ChangeLog[]) => {
				batch(() => {
					for (const change of changes) {
						const row: Cell = JSON.parse(change.row_json)
						const pk: { x: number; y: number } = JSON.parse(change.pk_json)

						if (change.op_type === 'INSERT') {
							setCells(
								produce(arr => {
									arr.push(row)
								})
							)
						}

						if (change.op_type === 'UPDATE') {
							setCells(
								produce(arr => {
									const i = arr.findIndex(c => c.x === row.x && c.y === row.y)
									if (i > -1) arr[i] = row
								})
							)
						}

						if (change.op_type === 'DELETE') {
							setCells(
								reconcile(cells.filter(c => !(c.x === pk.x && c.y === pk.y)))
							)
						}
					}
				})
			})
		)
	})

	return cells
}
