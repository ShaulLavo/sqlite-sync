import * as Comlink from 'comlink'
import { onMount } from 'solid-js'
import { createStore, produce, reconcile } from 'solid-js/store'
import { useDb } from '../context/DbProvider'
import { cells as cellsSchema } from '../sqlite/schema'

export type Cell = { x: number; y: number; alive: boolean }

export function useCells(width = 50, height = 30) {
	const { db, api } = useDb()
	const [cells, setCells] = createStore<Cell[]>([])

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
			batch = batch.filter(c => c.x != null && c.y != null) // TODO: is this needed?
			if (!batch.length) return
			await database.insert(cellsSchema).values(batch).run()

			const fresh = await database.select().from(cellsSchema).all()
			setCells(fresh)
		} else {
			setCells(existing)
		}

		api.subscribeToAllChangesInTable(
			'cells',
			Comlink.proxy((change: any) => {
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
			})
		)
	})

	return cells
}
