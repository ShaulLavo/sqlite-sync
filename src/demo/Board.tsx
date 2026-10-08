import { createSignal, For, onCleanup, onMount } from 'solid-js'
import type { ReactiveDatabase } from '../core/types'
import { applyPattern, HEIGHT, stepGeneration, WIDTH, type Pattern } from './database'
import type { Telemetry } from './metrics'

const TRAIL = 10
const NONE = 255
const speeds = [{ label: '2', value: 2 }, { label: '10', value: 10 }, { label: '30', value: 30 }, { label: 'Max', value: Infinity }]
const patterns: { id: Pattern; label: string }[] = [{ id: 'guns', label: 'Glider guns' }, { id: 'soup', label: 'Random soup' }, { id: 'acorn', label: 'Acorn' }, { id: 'clear', label: 'Clear' }]

export function Board(props: { db: ReactiveDatabase; telemetry: Telemetry; onError: (error: unknown) => void }) {
	const [generation, setGeneration] = createSignal(0)
	const [population, setPopulation] = createSignal(0)
	const [running, setRunning] = createSignal(false)
	const [speed, setSpeed] = createSignal(10)
	const [cursor, setCursor] = createSignal<{ x: number; y: number }>()
	const alive = new Uint8Array(WIDTH * HEIGHT)
	const age = new Uint8Array(WIDTH * HEIGHT).fill(NONE)
	let canvas!: HTMLCanvasElement
	let revision = 0
	let frame = 0
	let disposed = false
	let loop = 0

	const unsubscribeCells = props.db.liveTable('cells').subscribe(snapshot => {
		if (snapshot.status === 'error') { props.onError(snapshot.error); return }
		if (snapshot.status !== 'ready') return
		const next = new Uint8Array(WIDTH * HEIGHT)
		let count = 0
		for (const row of snapshot.rows) {
			const x = Number(row.x), y = Number(row.y)
			if (x >= WIDTH || y >= HEIGHT || row.alive !== 1) continue
			next[y * WIDTH + x] = 1
			count++
		}
		for (let i = 0; i < next.length; i++) {
			if (next[i]) age[i] = 0
			else if (alive[i]) age[i] = 1
			else if (age[i] !== NONE) age[i] = age[i] + 1 >= TRAIL ? NONE : age[i] + 1
		}
		alive.set(next)
		setPopulation(count)
		revision = snapshot.revision
		schedule()
	})
	const unsubscribeMeta = props.db.liveTable('demo_meta').subscribe(snapshot => {
		if (snapshot.status === 'ready') setGeneration(Number(snapshot.rows[0]?.generation ?? 0))
	})

	function schedule() {
		if (!frame) frame = requestAnimationFrame(draw)
	}

	function draw() {
		frame = 0
		const ctx = canvas.getContext('2d')
		if (!ctx) return
		const unit = canvas.width / WIDTH
		const gap = Math.max(1, unit * 0.12)
		ctx.fillStyle = '#0e0e10'
		ctx.fillRect(0, 0, canvas.width, canvas.height)
		ctx.fillStyle = '#1b1b1f'
		const dot = Math.max(1, unit * 0.1)
		for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) ctx.fillRect((x + 0.5) * unit - dot / 2, (y + 0.5) * unit - dot / 2, dot, dot)
		for (let i = 0; i < age.length; i++) {
			const a = age[i]
			if (a === NONE || a === 0) continue
			ctx.fillStyle = `rgba(255, 92, 40, ${0.42 * (1 - a / TRAIL)})`
			ctx.fillRect((i % WIDTH) * unit + gap, Math.floor(i / WIDTH) * unit + gap, unit - gap * 2, unit - gap * 2)
		}
		ctx.fillStyle = '#ff6a2b'
		for (let i = 0; i < alive.length; i++) {
			if (alive[i]) ctx.fillRect((i % WIDTH) * unit + gap / 2, Math.floor(i / WIDTH) * unit + gap / 2, unit - gap, unit - gap)
		}
		const focus = cursor()
		if (focus) {
			ctx.strokeStyle = '#f4f3ef'
			ctx.lineWidth = Math.max(1, unit * 0.1)
			ctx.strokeRect(focus.x * unit + 0.5, focus.y * unit + 0.5, unit - 1, unit - 1)
		}
		props.telemetry.painted(revision)
	}

	function resize() {
		const ratio = Math.min(2, devicePixelRatio || 1)
		const width = Math.round(canvas.clientWidth * ratio)
		canvas.width = width
		canvas.height = Math.round(width * HEIGHT / WIDTH)
		schedule()
	}

	onMount(() => {
		const observer = new ResizeObserver(resize)
		observer.observe(canvas)
		onCleanup(() => observer.disconnect())
	})

	async function step() {
		try { await stepGeneration(props.db); props.telemetry.stepped() }
		catch (error) { stop(); props.onError(error) }
	}

	async function run(token: number) {
		while (running() && token === loop && !disposed) {
			const started = performance.now()
			await step()
			const wait = 1000 / speed() - (performance.now() - started)
			await new Promise(resolve => setTimeout(resolve, Math.max(0, wait)))
		}
	}

	function start() {
		setRunning(true)
		void run(++loop)
	}

	function stop() {
		setRunning(false)
		loop++
		props.telemetry.idle()
	}

	async function pattern(id: Pattern) {
		try { await applyPattern(props.db, id) }
		catch (error) { props.onError(error) }
	}

	// Pointer painting: cells touched within one frame are written in a single UPDATE.
	let paintValue = 1
	let painting = false
	const queued = new Set<number>()
	let flushFrame = 0

	function cellAt(event: PointerEvent) {
		const bounds = canvas.getBoundingClientRect()
		const x = Math.floor((event.clientX - bounds.left) / bounds.width * WIDTH)
		const y = Math.floor((event.clientY - bounds.top) / bounds.height * HEIGHT)
		return x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT ? { x, y } : undefined
	}

	function queue(x: number, y: number) {
		queued.add(y * WIDTH + x)
		if (!flushFrame) flushFrame = requestAnimationFrame(flush)
	}

	function flush() {
		flushFrame = 0
		if (!queued.size) return
		const cells = [...queued].map(i => `(${i % WIDTH},${Math.floor(i / WIDTH)})`).join(',')
		queued.clear()
		props.db.execute(`UPDATE cells SET alive = ? WHERE (x, y) IN (VALUES ${cells})`, [paintValue]).catch(props.onError)
	}

	function pointerDown(event: PointerEvent) {
		const cell = cellAt(event)
		if (!cell) return
		canvas.setPointerCapture(event.pointerId)
		painting = true
		paintValue = alive[cell.y * WIDTH + cell.x] ? 0 : 1
		queue(cell.x, cell.y)
	}

	function pointerMove(event: PointerEvent) {
		if (!painting) return
		const cell = cellAt(event)
		if (cell) queue(cell.x, cell.y)
	}

	function keyDown(event: KeyboardEvent) {
		const current = cursor() ?? { x: WIDTH / 2, y: HEIGHT / 2 }
		const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault()
			paintValue = alive[current.y * WIDTH + current.x] ? 0 : 1
			queue(current.x, current.y)
			return
		}
		const move = moves[event.key]
		if (!move) return
		event.preventDefault()
		setCursor({ x: (current.x + move[0] + WIDTH) % WIDTH, y: (current.y + move[1] + HEIGHT) % HEIGHT })
		schedule()
	}

	onCleanup(() => {
		disposed = true
		stop()
		cancelAnimationFrame(frame)
		cancelAnimationFrame(flushFrame)
		unsubscribeCells()
		unsubscribeMeta()
	})

	return <section class="board" aria-label="Game of Life stored in SQLite">
		<div class="board-frame">
			<div class="hud hud-top">
				<span class="hud-item"><span class="label">Generation</span><span class="value" data-testid="generation">{generation().toLocaleString()}</span></span>
				<span class="hud-item"><span class="label">Alive</span><span class="value">{population().toLocaleString()}</span></span>
				<span class="hud-item hud-grid"><span class="label">Rows</span><span class="value">{WIDTH} × {HEIGHT}</span></span>
			</div>
			<canvas
				ref={canvas}
				tabindex="0"
				role="img"
				aria-label={`Game of Life board, generation ${generation()}, ${population()} living cells. Click or drag to draw cells; arrow keys and Space also work.`}
				onPointerDown={pointerDown}
				onPointerMove={pointerMove}
				onPointerUp={() => { painting = false }}
				onPointerCancel={() => { painting = false }}
				onFocus={() => { if (!cursor()) setCursor({ x: WIDTH / 2, y: HEIGHT / 2 }); schedule() }}
				onBlur={() => { setCursor(); schedule() }}
				onKeyDown={keyDown}
			/>
		</div>
		<div class="controls">
			<div class="control-group">
				<button class="btn btn-primary" aria-pressed={running()} onClick={() => running() ? stop() : start()}>
					<svg viewBox="0 0 16 16" aria-hidden="true">{running() ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M4 2.5v11l9-5.5z" />}</svg>
					{running() ? 'Pause' : 'Run'}
				</button>
				<button class="btn" disabled={running()} onClick={() => void step()}>Step</button>
			</div>
			<div class="control-group" role="group" aria-label="Generations per second">
				<span class="control-label">Gen/s</span>
				<div class="segmented">
					<For each={speeds}>{option => <button aria-pressed={speed() === option.value} onClick={() => setSpeed(option.value)}>{option.label}</button>}</For>
				</div>
			</div>
			<div class="control-group control-patterns" role="group" aria-label="Load a pattern">
				<For each={patterns}>{option => <button class="chip" onClick={() => void pattern(option.id)}>{option.label}</button>}</For>
			</div>
		</div>
		<p class="board-hint">Drag across the board to draw. Every stroke is an <code>UPDATE</code>; nothing here is drawn from local state.</p>
	</section>
}
