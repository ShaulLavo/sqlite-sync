import { batch, createSignal, onCleanup } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import type { LiveQuery, Row } from '../core/types'

export function createLiveQuery<T extends object>(
	query: LiveQuery,
	options: { map: (row: Row) => T; key?: string }
) {
	const [rows, setRows] = createStore<T[]>([])
	const [loading, setLoading] = createSignal(true)
	const [error, setError] = createSignal<Error>()
	const [updates, setUpdates] = createSignal(0)
	const [reconciliationMs, setReconciliationMs] = createSignal(0)
	const unsubscribe = query.subscribe(snapshot => {
		if (snapshot.status === 'loading') return
		if (snapshot.status === 'error') { setError(snapshot.error); setLoading(false); return }
		const start = performance.now()
		const next = snapshot.rows.map(options.map)
		batch(() => {
			// The optional mapper is the typed boundary between SQL and application rows.
			setRows(reconcile(next, { key: options.key ?? 'id' }))
			setLoading(false)
			setError(undefined)
			setUpdates(value => value + 1)
		})
		setReconciliationMs(performance.now() - start)
	})
	onCleanup(unsubscribe)
	return { rows, loading, error, updates, reconciliationMs }
}
