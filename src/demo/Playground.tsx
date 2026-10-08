import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { Change, CommitEvent, Inspection } from '../core/types'
import { connectDemo, initializeDemo } from './database'
import { Icon } from './icons'
import { Life } from './Life'
import { SqlWorkspace } from './SqlWorkspace'
import { Tables } from './Tables'

type View = 'life' | 'sql' | 'tables' | 'subscriptions'
type FeedRow = Change & { revision: number; receivedAt: number }
const tabs: { id: View; label: string }[] = [{ id: 'life', label: 'Game of Life' }, { id: 'sql', label: 'SQL playground' }, { id: 'tables', label: 'Tables' }, { id: 'subscriptions', label: 'Subscriptions' }]

function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error) }
function formatNumber(value: number | undefined) { return value === undefined ? '—' : value.toLocaleString() }

export default function Playground() {
	const db = connectDemo()
	const [state, setState] = createSignal<'loading' | 'ready' | 'failed'>('loading')
	const [error, setError] = createSignal('')
	const [view, setView] = createSignal<View>(location.pathname === '/info' ? 'tables' : location.pathname === '/changelog' ? 'subscriptions' : 'life')
	const [inspection, setInspection] = createSignal<Inspection>()
	const [latest, setLatest] = createSignal<CommitEvent>()
	const [feed, setFeed] = createSignal<FeedRow[]>([])
	const [deliveryMs, setDeliveryMs] = createSignal<number>()
	const [pending, setPending] = createSignal(false)
	let disposed = false
	let interval: ReturnType<typeof setInterval> | undefined

	function reportError(value: unknown) { setError(errorMessage(value)) }
	async function inspect() {
		if (pending() || disposed) return
		setPending(true)
		try { const value = await db.inspect(); if (!disposed) setInspection(value) }
		catch (value) { if (!disposed) reportError(value) }
		finally { if (!disposed) setPending(false) }
	}

	const unsubscribe = db.subscribeEvents(event => {
		if (disposed) return
		if (event.kind === 'error') return reportError(event.message)
		const receivedAt = performance.timeOrigin + performance.now()
		setLatest(event)
		setDeliveryMs(Math.max(0, receivedAt - event.committedAt))
		setFeed(rows => [...event.changes.slice(-80).reverse().map(change => ({ ...change, revision: event.revision, receivedAt })), ...rows].slice(0, 80))
	})

	onMount(async () => {
		try { await initializeDemo(db); if (disposed) return; setState('ready'); await inspect(); interval = setInterval(() => void inspect(), 1000) }
		catch (value) { reportError(value); setState('failed') }
	})
	onCleanup(() => { disposed = true; clearInterval(interval); unsubscribe(); db.close() })

	async function download() {
		try {
			const bytes = await db.exportDatabase()
			const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.sqlite3' }))
			const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'sqlite-sync.db'; anchor.click()
			setTimeout(() => URL.revokeObjectURL(url), 1000)
		} catch (value) { reportError(value) }
	}

	return <div class="playground">
		<header class="site-header"><a class="wordmark" href="/" aria-label="sqlite-sync home"><span class="brand-symbol"><Icon name="database" size={19} /></span>sqlite<span class="brand-hyphen">-</span>sync<span class="project-tag">LAB</span></a><div class="header-links"><a href="https://github.com/ShaulLavo/sqlite-sync" target="_blank" rel="noreferrer">Source <Icon name="external" size={13} /></a><button disabled={state() !== 'ready'} onClick={() => void download()}><Icon name="download" size={15} />Export database</button></div></header>
		<main>
			<div class="hero"><div><p class="eyebrow"><span class="status-dot" /> BROWSER-NATIVE · FRAMEWORK-INDEPENDENT</p><h1>Reactive SQLite.<br /><span>Watch it work.</span></h1><p class="hero-description">Write to a real database. See committed changes become live UI.<br class="desktop-break" /> Everything stays on this device, even after a reload.</p></div><div class="hero-note"><span class="note-line" /><p>SQLite → committed changes<br />→ reactive queries → your UI</p><span class="note-label">No polling. No server.</span></div></div>
			<nav class="demo-tabs" aria-label="Playground sections"><For each={tabs}>{tab => <button classList={{ active: view() === tab.id }} aria-current={view() === tab.id ? 'page' : undefined} onClick={() => setView(tab.id)}>{tab.label}<Show when={tab.id === 'life'}><span class="tab-dot" /></Show></button>}</For><span class="connection-status"><span class="status-dot" />{state() === 'ready' ? 'SQLite connected' : state() === 'failed' ? 'Connection failed' : 'Opening SQLite'}</span></nav>
			<Show when={error()}><div class="error-banner" role="alert"><span>{error()}</span><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div></Show>
			<Show when={state() === 'ready'} fallback={<div class="startup-state"><Icon name="database" size={32} /><h2>{state() === 'failed' ? 'SQLite could not open' : 'Opening your local database…'}</h2><p>{state() === 'failed' ? 'The error above includes the storage or worker failure. Close other tabs if exclusive ownership is in use, then reload.' : 'Starting the worker and restoring persisted tables.'}</p><Show when={state() === 'failed'}><button class="button" onClick={() => location.reload()}>Retry connection</button></Show></div>}>
				<div class="workspace"><div class="workspace-main"><Show when={view() === 'life'}><Life db={db} onError={reportError} inspectTables={() => setView('sql')} /></Show><Show when={view() === 'sql'}><SqlWorkspace db={db} onError={reportError} /></Show><Show when={view() === 'tables'}><Tables db={db} onError={reportError} /></Show><Show when={view() === 'subscriptions'}><section class="subscriptions-section"><div class="section-heading"><div><p class="eyebrow">04 / Selective reactivity</p><h2>Subscription inspector</h2></div></div><p class="caption">These are the real queries registered in the database worker. Whole-table subscriptions apply row patches; other queries rerun only when their dependencies change.</p><For each={inspection()?.queries}>{query => <div class="subscription-row"><div><span class="mode-badge">{query.mode}</span><span class="muted">{query.subscribers} listeners</span></div><code>{query.sql}</code><p>Dependencies · {query.tables.join(', ') || 'none'}</p></div>}</For><Show when={!inspection()?.queries.length}><p class="empty-state">Open Game of Life, SQL playground or Tables to register a subscription. Leaving a section releases its listeners.</p></Show><button class="button" onClick={() => void inspect()}>Refresh inspector</button></section></Show></div>
				<aside class="telemetry" aria-label="Database performance metrics"><p class="eyebrow">Under the hood</p><h3>Every write has a path.</h3><div class="pipeline"><div><span class="pipeline-number">1</span><div><h4>SQLite mutation</h4><p>Executed in the worker</p></div><strong>{formatNumber(inspection()?.mutations)}<small>row changes</small></strong></div><div><span class="pipeline-number">2</span><div><h4>Successful commit</h4><p>Rollback stays silent</p></div><strong>{formatNumber(inspection()?.commits)}<small>commits</small></strong></div><div><span class="pipeline-number">3</span><div><h4>Reactive queries</h4><p>Only affected dependencies</p></div><strong>{formatNumber(inspection()?.invalidations)}<small>invalidations</small></strong></div></div><dl class="performance-readings"><div><dt>Latest mutation execution</dt><dd>{latest() ? `${latest()?.executionMs.toFixed(2)} ms` : '—'}</dd></div><div><dt>Latest query processing</dt><dd>{latest() ? `${latest()?.queryMs.toFixed(2)} ms` : '—'}</dd></div><div><dt>Commit → event delivery</dt><dd>{deliveryMs() === undefined ? '—' : `${deliveryMs()?.toFixed(2)} ms`}</dd></div><div><dt>Query reruns</dt><dd>{formatNumber(inspection()?.queryRuns)}</dd></div><div><dt>Active listeners</dt><dd>{formatNumber(inspection()?.subscribers)}</dd></div><div><dt>Connected pages</dt><dd>{formatNumber(inspection()?.sessions)}</dd></div><div><dt>WASM heap capacity</dt><dd>{inspection() ? `${((inspection()?.wasmBytes ?? 0) / 1048576).toFixed(1)} MB` : '—'}</dd></div></dl><p class="telemetry-note">Worker counters are cumulative for this connection. Execution includes change detection. Delivery includes worker messaging and any query work before the event. Readings refresh every second.</p><div class="persistence-note"><Icon name="database" size={20} /><div><strong>Your data stays here.</strong><p>SQLite persists to browser storage. Export a database copy, or reload to test persistence.</p></div></div></aside></div>
				<section class="change-stream" aria-label="Committed database changes"><div class="stream-heading"><div><p class="eyebrow">Committed change stream</p><h3>The database, in motion.</h3></div><span><span class="status-dot" /> Live · latest 80 row changes</span></div><div class="stream-table"><table class="data-table"><thead><tr><th>Commit</th><th>Sequence</th><th>Operation</th><th>Table</th><th>Primary key</th><th>Row values</th></tr></thead><tbody><For each={feed().slice(0, 12)}>{change => <tr><td>#{change.revision}</td><td class="muted">{change.sequence}</td><td><span class={`operation operation-${change.operation.toLowerCase()}`}>{change.operation}</span></td><td>{change.table}</td><td><code>{JSON.stringify(change.key)}</code></td><td><code>{JSON.stringify(change.row)}</code></td></tr>}</For></tbody></table><Show when={!feed().length}><p class="empty-state">Step the simulation, edit a cell, or insert a user. Committed row changes appear here.</p></Show></div><p class="caption">Newest first for inspection. The engine delivers commits and their row changes in chronological order. Each commit can contain many mutations.</p></section>
			</Show>
		</main><footer class="site-footer"><span>sqlite-sync · local-first database infrastructure</span><span>SQLite + WebAssembly · optional Solid adapter</span></footer>
	</div>
}
