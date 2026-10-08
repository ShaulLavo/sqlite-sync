import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { Change, Inspection, Row } from '../core/types'
import { Board } from './Board'
import { Console } from './Console'
import { connectDemo, initializeDemo, stepSql } from './database'
import { createTelemetry } from './metrics'
import { TelemetryPanel } from './Telemetry'

type FeedRow = Change & { revision: number; id: number }

const REPO = 'https://github.com/ShaulLavo/sqlite-sync'
const keywords = new Set(['WITH', 'AS', 'MATERIALIZED', 'VALUES', 'SELECT', 'SUM', 'CASE', 'WHEN', 'AND', 'THEN', 'ELSE', 'END', 'FROM', 'WHERE', 'GROUP', 'BY', 'HAVING', 'OR', 'NOT', 'IN', 'UPDATE', 'SET'])

function highlight(sql: string) {
	return sql.split(/(\b[A-Za-z_]+\b|\b\d+\b)/).map(part => {
		if (keywords.has(part)) return <span class="tok-kw">{part}</span>
		if (/^\d+$/.test(part)) return <span class="tok-num">{part}</span>
		return part
	})
}

function compact(row: Row) {
	return Object.entries(row).map(([key, value]) => `${key}=${typeof value === 'string' ? JSON.stringify(value) : value instanceof Uint8Array ? `blob(${value.byteLength})` : String(value)}`).join(' ')
}

function count(value: number | undefined) {
	return value === undefined ? '—' : value.toLocaleString()
}

export default function Playground() {
	const db = connectDemo()
	const telemetry = createTelemetry()
	const [state, setState] = createSignal<'opening' | 'ready' | 'failed'>('opening')
	const [error, setError] = createSignal('')
	const [inspection, setInspection] = createSignal<Inspection>()
	const [feed, setFeed] = createSignal<FeedRow[]>([])
	let feedId = 0
	let disposed = false
	let timer: ReturnType<typeof setInterval> | undefined

	function report(value: unknown) {
		setError(value instanceof Error ? value.message : String(value))
	}

	async function inspect() {
		try { const value = await db.inspect(); if (!disposed) setInspection(value) }
		catch (value) { if (!disposed) report(value) }
	}

	const unsubscribe = db.subscribeEvents(event => {
		if (disposed) return
		if (event.kind === 'error') { setState('failed'); report(event.message); return }
		telemetry.commit(event)
		setInspection(previous => previous && { ...previous, revision: event.revision, ...event.totals })
		const fresh = event.changes.slice(-6).reverse().map(change => ({ ...change, revision: event.revision, id: feedId++ }))
		setFeed(rows => [...fresh, ...rows].slice(0, 9))
	})

	onMount(async () => {
		try {
			await initializeDemo(db)
			if (disposed) return
			setState('ready')
			await inspect()
			timer = setInterval(() => void inspect(), 1000)
		} catch (value) { report(value); setState('failed') }
	})

	onCleanup(() => { disposed = true; clearInterval(timer); unsubscribe(); db.close() })

	async function download() {
		try {
			const bytes = await db.exportDatabase()
			const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.sqlite3' }))
			const anchor = document.createElement('a')
			anchor.href = url
			anchor.download = 'sqlite-sync.db'
			anchor.click()
			setTimeout(() => URL.revokeObjectURL(url), 1000)
		} catch (value) { report(value) }
	}

	const status = () => state() === 'ready' ? 'SQLite ready' : state() === 'failed' ? 'SQLite failed' : 'Opening SQLite'

	return <div class="page">
		<header class="topbar">
			<a class="wordmark" href={import.meta.env.BASE_URL}><span class="mark" aria-hidden="true"><i /><i /><i /><i /></span>sqlite-sync</a>
			<div class="topbar-right">
				<span class="status" classList={{ ready: state() === 'ready', failed: state() === 'failed' }}><i />{status()}</span>
				<button class="link" disabled={state() !== 'ready'} onClick={() => void download()}>Download .db</button>
				<a class="link" href={REPO} target="_blank" rel="noreferrer">GitHub ↗</a>
			</div>
		</header>

		<main>
			<section class="intro">
				<h1>Every cell is a row.<br /><em>Every generation is a&nbsp;transaction.</em></h1>
				<p>This is Conway's Game of Life running inside SQLite, in your browser. Each step is one SQL statement, committed to disk, then pushed back to the canvas as a live query. Reload the page and the board is still here.</p>
			</section>

			<Show when={error()}>
				<div class="alert" role="alert"><span>{error()}</span><button onClick={() => setError('')} aria-label="Dismiss">×</button></div>
			</Show>

			<Show when={state() === 'ready'} fallback={<div class="opening"><span class="spinner" aria-hidden="true" /><p>{state() === 'failed' ? 'SQLite could not open in this browser. Close other tabs of this page and reload.' : 'Starting the SQLite worker and restoring your board…'}</p></div>}>
				<Board db={db} telemetry={telemetry} onError={report} />
				<TelemetryPanel telemetry={telemetry} />

				<section class="section split">
					<div class="section-head">
						<span class="kicker">01 · The rules, in SQL</span>
						<h2>The whole simulation is one <code>UPDATE</code>.</h2>
						<p>Only living cells are scanned. Each one adds 2 to its eight neighbours and 1 to itself, so a single grouped sum tells SQLite which cells flip. No joins, no application code, and only changed rows are written.</p>
					</div>
					<pre class="code" aria-label="Step query"><code>{highlight(stepSql)}</code></pre>
				</section>

				<section class="section">
					<div class="section-head">
						<span class="kicker">02 · What one commit sets in motion</span>
						<h2>From write to screen, counted.</h2>
					</div>
					<ol class="flow">
						<li><span class="flow-n">{count(inspection()?.commits)}</span><span class="flow-t">Commits</span><span class="flow-d">Transactions that succeeded. A rollback never notifies anyone.</span></li>
						<li><span class="flow-n">{count(inspection()?.mutations)}</span><span class="flow-t">Rows captured</span><span class="flow-d">Inserts, updates and deletes recorded inside each commit.</span></li>
						<li><span class="flow-n">{count(inspection()?.invalidations)}</span><span class="flow-t">Queries woken</span><span class="flow-d">Only subscriptions that read a changed table.</span></li>
						<li><span class="flow-n">{count(inspection()?.queryRuns)}</span><span class="flow-t">Queries re-run</span><span class="flow-d">Table subscriptions get row patches instead of re-running.</span></li>
					</ol>
					<div class="two-col">
						<div class="panel">
							<div class="panel-head"><span>Change stream</span><span class="muted">newest first</span></div>
							<ul class="stream" aria-live="off">
								<For each={feed()} fallback={<li class="stream-empty">Run the board or edit a cell. Row changes land here as they commit.</li>}>
									{change => <li><span class="muted">#{change.revision}</span><span class={`op op-${change.operation.toLowerCase()}`}>{change.operation}</span><span class="stream-table">{change.table}</span><span class="stream-row">{compact(change.row)}</span></li>}
								</For>
							</ul>
						</div>
						<div class="panel">
							<div class="panel-head"><span>Live subscriptions</span><span class="muted">{count(inspection()?.sessions)} {inspection()?.sessions === 1 ? 'tab' : 'tabs'} connected</span></div>
							<ul class="subs">
								<For each={inspection()?.queries} fallback={<li class="stream-empty">No live queries.</li>}>
									{query => <li><code>{query.sql}</code><span class="muted">{query.mode === 'incremental' ? 'row patches' : 're-run'} · {query.tables.join(', ') || 'no tables'} · {query.subscribers} {query.subscribers === 1 ? 'listener' : 'listeners'}</span></li>}
								</For>
							</ul>
						</div>
					</div>
				</section>

				<section class="section">
					<div class="section-head">
						<span class="kicker">03 · Try it yourself</span>
						<h2>Ask the board a question.</h2>
						<p>Queries stay subscribed. Start the board, run "Busiest columns", and watch the result change on every commit. Anything else runs once against the same database.</p>
					</div>
					<Console db={db} />
				</section>
			</Show>

			<section class="section">
				<div class="section-head">
					<span class="kicker">04 · Measured in the lab</span>
					<h2>Benchmarks, with their caveats.</h2>
					<p>Headless Chromium 153 on an Intel Core i7-14700K, real SQLite 3.49 WASM with OPFS. Medians unless stated.</p>
				</div>
				<div class="bench">
					<div class="bench-card bench-wide">
						<span class="label">Reconcile 10,000 rows after 1,000 changes</span>
						<div class="bars">
							<div class="bar-row"><span>Previous store</span><div class="bar"><i style={{ width: '100%' }} /></div><b>3,191.9 ms</b></div>
							<div class="bar-row accent"><span>sqlite-sync</span><div class="bar"><i style={{ width: '0.6%' }} /></div><b>6.3 ms</b></div>
						</div>
						<span class="metric-note">About 500× less work: changed rows are patched by key instead of searched for.</span>
					</div>
					<div class="bench-card"><span class="label">Commit → notification</span><span class="metric-value">3.3<small>ms p50</small></span><span class="metric-note">5.0 ms p95, one subscriber. 3.9 / 5.9 ms with twenty.</span></div>
					<div class="bench-card"><span class="label">Two tabs, one database</span><span class="metric-value">456<small>commits/s</small></span><span class="metric-note">Both tabs' live queries reach the same final count.</span></div>
					<div class="bench-card"><span class="label">Grouped JOIN, 15,000 rows</span><span class="metric-value">1.0<small>ms SQL</small></span><span class="metric-note">500 rows changed per commit; 0.6 ms of live query work.</span></div>
				</div>
				<p class="fineprint">Not everything is faster: batches of 1,000 distinct literal statements are slower than before. <a href={`${REPO}/blob/main/docs/benchmarks.md`} target="_blank" rel="noreferrer">Full method and raw samples ↗</a></p>
			</section>
		</main>

		<footer class="footer">
			<span>sqlite-sync: reactive SQLite for the browser. No server involved.</span>
			<a href={REPO} target="_blank" rel="noreferrer">Source ↗</a>
		</footer>
	</div>
}
