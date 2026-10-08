import { createSignal, createUniqueId, For, onCleanup, Show } from 'solid-js'
import type { QuerySnapshot, ReactiveDatabase, SqlValue } from '../core/types'

const examples = [
	{ label: 'Population', sql: 'SELECT generation,\n  (SELECT count(*) FROM cells WHERE alive) AS alive,\n  (SELECT count(*) FROM cells) AS rows\nFROM demo_meta' },
	{ label: 'Busiest columns', sql: 'SELECT x AS column, count(*) AS alive\nFROM cells WHERE alive\nGROUP BY x ORDER BY alive DESC, x\nLIMIT 8' },
	{ label: 'Users', sql: 'SELECT id, name, email FROM users ORDER BY id' },
	{ label: 'Add a user', sql: "INSERT INTO users (name, email)\nVALUES ('Grace Hopper', 'grace' || abs(random() % 10000) || '@example.test')" }
]

function isQuery(sql: string) {
	return /^\s*(select|with|values|pragma)\b/i.test(sql)
}

function display(value: SqlValue | undefined) {
	if (value === null || value === undefined) return 'NULL'
	if (value instanceof Uint8Array) return `blob(${value.byteLength})`
	return typeof value === 'number' ? value.toLocaleString() : String(value)
}

export function Console(props: { db: ReactiveDatabase }) {
	const editorId = createUniqueId()
	const [sql, setSql] = createSignal(examples[0].sql)
	const [snapshot, setSnapshot] = createSignal<QuerySnapshot>({ status: 'loading' })
	const [deliveries, setDeliveries] = createSignal(0)
	const [message, setMessage] = createSignal<{ text: string; error?: boolean }>()
	let unsubscribe = () => {}

	function watch(statement: string) {
		unsubscribe()
		setDeliveries(0)
		setSnapshot({ status: 'loading' })
		unsubscribe = props.db.liveQuery(statement).subscribe(value => {
			setSnapshot(value)
			if (value.status === 'ready') setDeliveries(count => count + 1)
		})
	}

	async function run(statement = sql()) {
		setMessage()
		if (isQuery(statement)) { watch(statement); return }
		try {
			const result = await props.db.execute(statement)
			setMessage({ text: `${result.rowsAffected} row${result.rowsAffected === 1 ? '' : 's'} affected. Live queries that depend on it have already updated.` })
		} catch (error) {
			setMessage({ text: error instanceof Error ? error.message : String(error), error: true })
		}
	}

	function pick(example: typeof examples[number]) {
		setSql(example.sql)
		void run(example.sql)
	}

	watch(sql())
	onCleanup(() => unsubscribe())

	const ready = () => { const value = snapshot(); return value.status === 'ready' ? value : undefined }

	return <div class="console">
		<div class="console-examples" role="group" aria-label="Example statements">
			<For each={examples}>{example => <button class="chip" aria-pressed={sql() === example.sql} onClick={() => pick(example)}>{example.label}</button>}</For>
		</div>
		<div class="editor">
			<label class="sr-only" for={editorId}>SQL statement</label>
			<textarea
				id={editorId}
				value={sql()}
				spellcheck={false}
				rows={5}
				onInput={event => setSql(event.currentTarget.value)}
				onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void run() } }}
			/>
			<div class="editor-bar">
				<span class="muted">{isQuery(sql()) ? 'Query: results stay live' : 'Statement: runs once'} · ⌘/Ctrl + Enter</span>
				<button class="btn btn-primary" onClick={() => void run()}>Run</button>
			</div>
		</div>
		<Show when={message()}>{value => <p class="console-message" classList={{ error: value().error }} role="status">{value().text}</p>}</Show>
		<div class="results">
			<div class="results-bar">
				<span><i class="live-dot" classList={{ off: !ready() }} />{ready() ? 'Live result' : snapshot().status === 'error' ? 'Error' : 'Waiting'}</span>
				<span class="muted">{deliveries().toLocaleString()} {deliveries() === 1 ? 'delivery' : 'deliveries'}</span>
			</div>
			<Show when={ready()} fallback={<p class="results-empty" classList={{ error: snapshot().status === 'error' }}>{(() => { const value = snapshot(); return value.status === 'error' ? value.error.message : 'Running…' })()}</p>}>
				{value => <div class="results-scroll">
					<table>
						<thead><tr><For each={value().columns}>{column => <th>{column}</th>}</For></tr></thead>
						<tbody><For each={value().rows.slice(0, 50)}>{row => <tr><For each={value().columns}>{column => <td classList={{ num: typeof row[column] === 'number', null: row[column] === null }}>{display(row[column])}</td>}</For></tr>}</For></tbody>
					</table>
					<Show when={!value().rows.length}><p class="results-empty">No rows.</p></Show>
				</div>}
			</Show>
		</div>
	</div>
}
