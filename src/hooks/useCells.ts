import * as Comlink from 'comlink'
import { onMount } from 'solid-js'
import { createStore, produce, reconcile } from 'solid-js/store'
import { useDb } from '../context/DbProvider'
import { cells as cellsSchema } from '../sqlite/schema'

export type Cell = { x: number | null; y: number | null; alive: boolean }

export function useCells(width = 50, height = 30) {
	const { db, api } = useDb()
	const [cells, setCells] = createStore<Cell[]>([])

	onMount(async () => {
		const database = await db

		const existing = await database.select().from(cellsSchema).all()

		const total = width * height
		if (existing.length !== total) {
			await database.delete(cellsSchema).run()
			const batch: Cell[] = []
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

		api.subscribeToAllChangesInTable(
			'cells',
			Comlink.proxy((change: any) => {
				const row: Cell | null = change.row_json
					? JSON.parse(change.row_json)
					: null
				const pk: { x: number; y: number } | null = change.pk_json
					? JSON.parse(change.pk_json)
					: null

				if (change.op_type === 'INSERT' && row) {
					setCells(
						produce(arr => {
							arr.push(row)
						})
					)
				}

				if (change.op_type === 'UPDATE' && row) {
					setCells(
						produce(arr => {
							const i = arr.findIndex(c => c.x === row.x && c.y === row.y)
							if (i > -1) arr[i] = row
						})
					)
				}

				if (change.op_type === 'DELETE' && pk) {
					setCells(
						reconcile(cells.filter(c => !(c.x === pk.x && c.y === pk.y)))
					)
				}
			})
		)
	})

	return cells
}
