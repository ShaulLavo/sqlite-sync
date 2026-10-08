import { batch, createSignal, onCleanup } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import type { LiveQuery, Row, QuerySnapshot } from '../core/types'

export function createLiveQuery<T extends object>(
	query: LiveQuery,
	options: { map: (row: Row) => T; key?: string }
) {
	const [rows, setRows] = createStore<T[]>([])
	const [loading, setLoading] = createSignal(true)
	const [error, setError] = createSignal<Error>()
	const [updates, setUpdates] = createSignal(0)
	const [reconciliationMs, setReconciliationMs] = createSignal(0)
	const mapped = new WeakMap<Row, T>()
	const applyReady = (snapshot: Extract<QuerySnapshot, { status: 'ready' }>) => {
		const start = performance.now()
		const next = mapRows(snapshot.rows, options.map, mapped)
		batch(() => {
			setRows(reconcile(next, { key: options.key ?? 'id' }))
			setLoading(false)
			setError(undefined)
			setUpdates(value => value + 1)
			setReconciliationMs(performance.now() - start)
		})
	}
	const unsubscribe = query.subscribe(snapshot => {
		if (snapshot.status === 'loading') { setLoading(true); return }
		if (snapshot.status === 'error') { setError(snapshot.error); setLoading(false); return }
		try { applyReady(snapshot) }
		catch (error) {
			setError(error instanceof Error ? error : new Error(String(error)))
			setLoading(false)
		}
	})

	onCleanup(unsubscribe)
	return { rows, loading, error, updates, reconciliationMs }
}

function mapRows<T extends object>(rows: readonly Row[], mapper: (row: Row) => T, cache: WeakMap<Row, T>): T[] {
	return rows.map(row => {
		const cached = cache.get(row)
		if (cached) return cached
		const value = mapper(row)
		cache.set(row, value)
		return value
	})
}
