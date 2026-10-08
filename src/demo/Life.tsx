import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { createLiveQuery } from '../adapters/solid'
import type { ReactiveDatabase } from '../core/types'
import { HEIGHT, WIDTH, numeric, resetGeneration, stepGeneration } from './database'
import { Icon } from './icons'

export function Life(props: { db: ReactiveDatabase; onError: (error: unknown) => void; inspectTables: () => void }) {
	const cells = createLiveQuery(props.db.liveTable('cells'), {
		map: row => ({ key: `${numeric(row, 'x')},${numeric(row, 'y')}`, x: numeric(row, 'x'), y: numeric(row, 'y'), alive: numeric(row, 'alive') === 1 }),
		key: 'key'
	})
	const meta = createLiveQuery(props.db.liveTable('demo_meta'), { map: row => ({ id: numeric(row, 'id'), generation: numeric(row, 'generation') }) })
	const [running, setRunning] = createSignal(false)
	const [busy, setBusy] = createSignal(false)
	const [speed, setSpeed] = createSignal(5)
	const [drawMs, setDrawMs] = createSignal(0)
	const [draws, setDraws] = createSignal(0)
	const [cursor, setCursor] = createSignal({ x: 0, y: 0 })
	let canvas: HTMLCanvasElement | undefined
	let timer: ReturnType<typeof setTimeout> | undefined
	let disposed = false
	const width = createMemo(() => cells.rows.reduce((max, cell) => Math.max(max, cell.x + 1), WIDTH))
	const height = createMemo(() => cells.rows.reduce((max, cell) => Math.max(max, cell.y + 1), HEIGHT))
	const population = createMemo(() => cells.rows.reduce((count, cell) => count + Number(cell.alive), 0))

	function stop() {
		setRunning(false)
		clearTimeout(timer)
	}

	async function step() {
		if (busy() || disposed) return
		setBusy(true)
		try { await stepGeneration(props.db) }
		catch (error) { stop(); props.onError(error) }
		finally { setBusy(false) }
	}

	async function tick() {
		if (!running() || disposed) return
		await step()
		if (running() && !disposed) timer = setTimeout(() => void tick(), 1000 / speed())
	}

	function toggleRun() {
		if (running()) return stop()
		setRunning(true)
		void tick()
	}

	async function reset() {
		stop()
		try { await resetGeneration(props.db) }
		catch (error) { props.onError(error) }
	}

	async function toggleCell(x: number, y: number) {
		try { await props.db.execute('UPDATE cells SET alive = 1 - alive WHERE x = ? AND y = ?', [x, y]) }
		catch (error) { props.onError(error) }
	}

	function clickBoard(event: MouseEvent) {
		if (!canvas) return
		const bounds = canvas.getBoundingClientRect()
		const x = Math.min(width() - 1, Math.floor((event.clientX - bounds.left) / bounds.width * width()))
		const y = Math.min(height() - 1, Math.floor((event.clientY - bounds.top) / bounds.height * height()))
		setCursor({ x, y })
		void toggleCell(x, y)
	}

	function keyBoard(event: KeyboardEvent) {
		const current = cursor()
		const offsets: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
		if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); void toggleCell(current.x, current.y); return }
		const delta = offsets[event.key]
		if (!delta) return
		event.preventDefault()
		setCursor({ x: Math.max(0, Math.min(width() - 1, current.x + delta[0])), y: Math.max(0, Math.min(height() - 1, current.y + delta[1])) })
	}

	function draw() {
		const ctx = canvas?.getContext('2d')
		if (!ctx || !canvas) return
		const started = performance.now()
		const unit = 16
		canvas.width = width() * unit
		canvas.height = height() * unit
		ctx.fillStyle = '#18231e'
		ctx.fillRect(0, 0, canvas.width, canvas.height)
		ctx.strokeStyle = '#26372c'
		ctx.lineWidth = 0.5
		for (let x = 0; x <= width(); x++) { ctx.beginPath(); ctx.moveTo(x * unit, 0); ctx.lineTo(x * unit, canvas.height); ctx.stroke() }
		for (let y = 0; y <= height(); y++) { ctx.beginPath(); ctx.moveTo(0, y * unit); ctx.lineTo(canvas.width, y * unit); ctx.stroke() }
		ctx.fillStyle = '#c8f38a'
		for (const cell of cells.rows) { if (cell.alive) ctx.fillRect(cell.x * unit + 2, cell.y * unit + 2, unit - 4, unit - 4) }
		ctx.strokeStyle = '#ffffff'
		ctx.lineWidth = 1.5
		ctx.strokeRect(cursor().x * unit + 1, cursor().y * unit + 1, unit - 2, unit - 2)
		setDrawMs(performance.now() - started)
		setDraws(value => value + 1)
	}

	createEffect(draw)
	onCleanup(() => { disposed = true; stop() })

	return <section class="life-section" aria-label="SQLite Game of Life">
		<div class="section-heading">
			<div><p class="eyebrow">01 / A living database</p><h2>Conway’s Game of Life</h2></div>
			<span class="storage-badge"><span class="status-dot" /> State stored in SQLite</span>
		</div>
		<div class="board-shell">
			<div class="board-heading"><span>GENERATION <strong>{meta.rows[0]?.generation ?? 0}</strong></span><span><i /> {running() ? 'Simulation running' : 'Ready when you are'}</span><span>{population()} living cells</span></div>
			<canvas ref={canvas} class="life-canvas" tabindex="0" role="button" aria-label={`Life board. ${population()} living cells. Click to toggle a cell or use arrow keys and Space. Selected cell ${cursor().x}, ${cursor().y}.`} onClick={clickBoard} onKeyDown={keyBoard} />
			<div class="board-footer"><span>{width()} × {height()} cells · click to write a cell</span><button onClick={props.inspectTables}>Inspect cells table <Icon name="arrow" size={14} /></button></div>
		</div>
		<div class="life-controls">
			<div class="control-buttons"><button class="button primary" onClick={toggleRun}><Icon name={running() ? 'pause' : 'play'} />{running() ? 'Pause' : 'Play'}</button><button class="button" disabled={busy() || running()} onClick={() => void step()}><Icon name="step" />Step</button><button class="button quiet" disabled={busy()} onClick={() => void reset()}><Icon name="reset" />Reset</button></div>
			<label class="speed-control">Speed <input type="range" min="1" max="20" value={speed()} onInput={event => setSpeed(Number(event.currentTarget.value))} /><span>{speed()} gen/s</span></label>
		</div>
		<div class="life-proof"><span><strong>{cells.updates()}</strong> adapter snapshots</span><span><strong>{draws()}</strong> canvas draws</span><span><strong>{cells.reconciliationMs().toFixed(2)} ms</strong> reconcile</span><span><strong>{drawMs().toFixed(2)} ms</strong> draw</span></div>
		<p class="caption">Each step computes the next generation inside SQLite and commits it with the generation counter. Reload this page to resume the same board.</p>
		{cells.error() && <p role="alert" class="inline-error">{cells.error()?.message}</p>}
	</section>
}
