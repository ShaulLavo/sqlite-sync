import { createEffect, createMemo, onCleanup, onMount, Show } from 'solid-js'
import { median, type Sample, type Telemetry } from './metrics'

function ms(value: number | undefined) {
	if (value === undefined) return '—'
	return value < 10 ? value.toFixed(1) : Math.round(value).toString()
}

function Chart(props: { samples: Sample[] }) {
	let canvas!: HTMLCanvasElement
	const SLOTS = 120

	function draw() {
		const ctx = canvas.getContext('2d')
		if (!ctx) return
		const ratio = Math.min(2, devicePixelRatio || 1)
		canvas.width = Math.round(canvas.clientWidth * ratio)
		canvas.height = Math.round(canvas.clientHeight * ratio)
		const { width, height } = canvas
		ctx.clearRect(0, 0, width, height)
		const totals = props.samples.map(sample => sample.sqlMs + sample.pixelsMs)
		const sorted = [...totals].sort((a, b) => a - b)
		const top = Math.max(4, Math.ceil((sorted[Math.floor(sorted.length * 0.95)] ?? 4) / 4) * 4)
		const head = 20 * ratio
		const plot = height - head
		ctx.strokeStyle = '#26262b'
		ctx.lineWidth = 1
		for (const fraction of [0.25, 0.5, 0.75, 1]) {
			const y = Math.round(head + plot - plot * fraction) + 0.5
			ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
		}
		ctx.fillStyle = '#6c6b67'
		ctx.font = `${11 * ratio}px "Geist Mono", ui-monospace, monospace`
		ctx.textBaseline = 'top'
		ctx.fillText(`${top} ms`, 0, 0)
		const slot = width / SLOTS
		const bar = Math.max(1, slot - Math.max(1, ratio))
		const offset = SLOTS - props.samples.length
		props.samples.forEach((sample, index) => {
			const x = (offset + index) * slot
			const sql = Math.min(plot, sample.sqlMs / top * plot)
			const rest = Math.min(plot - sql, sample.pixelsMs / top * plot)
			ctx.fillStyle = '#ff6a2b'
			ctx.fillRect(x, head + plot - sql, bar, sql)
			ctx.fillStyle = '#d9d7d0'
			ctx.fillRect(x, head + plot - sql - rest, bar, rest)
		})
	}

	onMount(() => {
		const observer = new ResizeObserver(draw)
		observer.observe(canvas)
		onCleanup(() => observer.disconnect())
	})
	createEffect(draw)

	return <canvas ref={canvas} class="chart" role="img" aria-label="Latency of the last 120 generations: SQL execution and commit to pixels." />
}

export function TelemetryPanel(props: { telemetry: Telemetry }) {
	const samples = () => props.telemetry.samples()
	const recent = createMemo(() => samples().slice(-30))
	const sql = createMemo(() => median(recent().map(sample => sample.sqlMs)))
	const pixels = createMemo(() => median(recent().map(sample => sample.pixelsMs)))
	const rows = createMemo(() => recent().at(-1)?.rows)

	return <section class="telemetry" aria-label="Live timings from this browser">
		<div class="metrics">
			<div class="metric">
				<span class="label"><i class="swatch swatch-sql" />SQL step</span>
				<span class="metric-value">{ms(sql())}<small>ms</small></span>
				<span class="metric-note">UPDATE + commit to OPFS, in the worker</span>
			</div>
			<div class="metric">
				<span class="label"><i class="swatch swatch-pixels" />Commit → pixels</span>
				<span class="metric-value">{ms(pixels())}<small>ms</small></span>
				<span class="metric-note">Change capture, live query, canvas paint</span>
			</div>
			<div class="metric">
				<span class="label">Rows per generation</span>
				<span class="metric-value">{rows()?.toLocaleString() ?? '—'}</span>
				<span class="metric-note">Captured row changes in the last commit</span>
			</div>
			<div class="metric">
				<span class="label">Generations / s</span>
				<span class="metric-value">{props.telemetry.rate()}</span>
				<span class="metric-note">Measured, not the speed setting</span>
			</div>
		</div>
		<div class="chart-wrap">
			<Chart samples={samples()} />
			<Show when={!samples().length}><p class="chart-empty">Press Run. Each generation draws one bar here.</p></Show>
		</div>
		<p class="fineprint">Medians over the last 30 generations, measured live in your browser. Your numbers are your machine's.</p>
	</section>
}
