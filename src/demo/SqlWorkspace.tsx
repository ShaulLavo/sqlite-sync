import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import type { QuerySnapshot, ReactiveDatabase, SqlValue } from '../core/types'
import { Icon } from './icons'

export function displayValue(value: SqlValue | undefined): string {
	if (value === null || value === undefined) return 'NULL'
	if (value instanceof Uint8Array) return `[blob: ${value.byteLength} bytes]`
	return String(value)
}

export function ResultTable(props: { snapshot: QuerySnapshot; maxRows?: number }) {
	const ready = () => props.snapshot.status === 'ready' ? props.snapshot : undefined
	return <Show when={ready()} fallback={<p class="empty-state">{props.snapshot.status === 'error' ? props.snapshot.error.message : 'Preparing a consistent snapshot…'}</p>}>
		<div class="result-scroll"><table class="data-table"><thead><tr><For each={ready()?.columns}>{column => <th>{column}</th>}</For></tr></thead><tbody><For each={ready()?.rows.slice(0, props.maxRows ?? 100)}>{row => <tr><For each={ready()?.columns}>{column => <td classList={{ 'null-value': row[column] === null }}>{displayValue(row[column])}</td>}</For></tr>}</For></tbody></table><Show when={ready()?.rows.length === 0}><p class="empty-state">No rows. Try adding data or changing your query.</p></Show></div>
	</Show>
}

const examples = [
	{ label: 'Living cells', sql: 'SELECT x, y, alive FROM cells WHERE alive = 1 ORDER BY y, x LIMIT 100' },
	{ label: 'Users', sql: 'SELECT id, name, email, is_active FROM users ORDER BY id' },
	{ label: 'Join + count', sql: 'SELECT u.id, u.name, COUNT(p.id) AS posts\nFROM users u LEFT JOIN posts p ON p.author_id = u.id\nGROUP BY u.id ORDER BY posts DESC, u.id' },
	{ label: 'Generation', sql: 'SELECT generation, (SELECT COUNT(*) FROM cells WHERE alive = 1) AS living_cells FROM demo_meta WHERE id = 1' }
]

export function SqlWorkspace(props: { db: ReactiveDatabase; initialTable?: string; onError: (error: unknown) => void }) {
	const [sql, setSql] = createSignal(props.initialTable ? `SELECT * FROM "${props.initialTable}" LIMIT 100` : examples[0].sql)
	const [activeSql, setActiveSql] = createSignal(sql())
	const [snapshot, setSnapshot] = createSignal<QuerySnapshot>({ status: 'loading' })
	const [updates, setUpdates] = createSignal(0)
	const [busy, setBusy] = createSignal(false)
	const [mutationResult, setMutationResult] = createSignal('')
	let unsubscribe = () => {}

	function watch(statement: string) {
		unsubscribe()
		setSnapshot({ status: 'loading' })
		setActiveSql(statement)
		unsubscribe = props.db.liveQuery(statement).subscribe(value => {
			setSnapshot(value)
			if (value.status === 'ready') setUpdates(count => count + 1)
		})
	}
	createEffect(() => {
		if (!props.initialTable) return
		const statement = `SELECT * FROM "${props.initialTable}" LIMIT 100`
		setSql(statement)
		watch(statement)
	})
	watch(sql())
	onCleanup(() => unsubscribe())

	async function runMutation() {
		setBusy(true)
		setMutationResult('')
		try { const result = await props.db.execute(sql()); setMutationResult(`${result.rowsAffected} directly affected rows. Committed changes appear in the stream below.`) }
		catch (error) { props.onError(error) }
		finally { setBusy(false) }
	}

	function editorKey(event: KeyboardEvent) {
		if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
		event.preventDefault()
		watch(sql())
	}

	return <section class="sql-section" aria-label="Reactive SQL playground">
		<div class="section-heading"><div><p class="eyebrow">02 / Ask SQLite anything</p><h2>SQL playground</h2></div><span class="storage-badge"><span class="status-dot" /> Live result subscription</span></div>
		<div class="query-examples"><span>Try a query</span><For each={examples}>{example => <button onClick={() => { setSql(example.sql); watch(example.sql) }}>{example.label}</button>}</For></div>
		<div class="editor-shell"><div class="editor-heading"><span><Icon name="code" size={15} /> query.sql</span><span>SQLite · Ctrl / ⌘ + Enter to subscribe</span></div><label class="sr-only" for="sql-editor">SQL query or mutation</label><textarea id="sql-editor" value={sql()} onInput={event => setSql(event.currentTarget.value)} onKeyDown={editorKey} spellcheck={false} /><div class="editor-actions"><span>SELECT queries stay live. Execute mutations separately.</span><div><button class="button quiet" disabled={busy()} onClick={() => void runMutation()}>Execute mutation</button><button class="button primary" onClick={() => watch(sql())}><Icon name="play" size={15} />Subscribe query</button></div></div></div>
		<Show when={mutationResult()}><p class="caption" role="status">{mutationResult()}</p></Show>
		<div class="result-heading"><h3>Live results</h3><span>{snapshot().status === 'ready' ? 'Committed snapshot' : snapshot().status} · {updates()} deliveries · max 100 displayed rows</span></div>
		<ResultTable snapshot={snapshot()} />
		<p class="caption">Subscription: <code>{activeSql()}</code></p>
	</section>
}
