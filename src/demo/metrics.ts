import { createSignal } from 'solid-js'
import type { CommitEvent } from '../core/types'

export type Sample = { revision: number; sqlMs: number; pixelsMs: number; rows: number }

const HISTORY = 120

// Joins worker commit events with the moment the board paints that revision,
// so one sample covers SQL execution through to pixels on screen.
export function createTelemetry() {
	const commits = new Map<number, CommitEvent>()
	const [samples, setSamples] = createSignal<Sample[]>([])
	const [latest, setLatest] = createSignal<CommitEvent>()
	const [rate, setRate] = createSignal(0)
	const stepTimes: number[] = []

	function commit(event: CommitEvent) {
		commits.set(event.revision, event)
		if (commits.size > 400) commits.delete(commits.keys().next().value!)
		setLatest(event)
	}

	function painted(revision: number) {
		const event = commits.get(revision)
		if (!event || !event.changes.some(change => change.table === 'cells')) return
		commits.delete(revision)
		const pixelsMs = Math.max(0, performance.timeOrigin + performance.now() - event.committedAt)
		setSamples(list => [...list.slice(-(HISTORY - 1)), { revision, sqlMs: event.executionMs, pixelsMs, rows: event.changes.length }])
	}

	function stepped() {
		const now = performance.now()
		stepTimes.push(now)
		while (stepTimes.length && stepTimes[0] < now - 1000) stepTimes.shift()
		setRate(stepTimes.length)
	}

	function idle() {
		stepTimes.length = 0
		setRate(0)
	}

	return { commit, painted, stepped, idle, samples, latest, rate }
}

export type Telemetry = ReturnType<typeof createTelemetry>

export function median(values: number[]) {
	if (!values.length) return undefined
	const sorted = [...values].sort((a, b) => a - b)
	return sorted[Math.floor(sorted.length / 2)]
}
