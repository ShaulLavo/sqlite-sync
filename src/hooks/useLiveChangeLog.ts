import * as Comlink from 'comlink'
import { desc, lt } from 'drizzle-orm'
import { createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { useDb } from '../context/DbProvider'
import type { ChangeLog } from '../sqlite/schema'
import { changeLog } from '../sqlite/schema'

export const useLiveChangeLog = (windowSize = 12) => {
	const { api, db } = useDb()

	const [buffer, setBuffer] = createStore<ChangeLog[]>([])

	let highestSeenId = 0
	let lowestSeenId = Infinity

	const [windowStart, setWindowStart] = createSignal(0)
	const visibleWindow = createMemo(() => {
		const start = windowStart()
		return buffer.slice(start, start + windowSize)
	})

	let unsubscribe: (() => void) | null = null

	const pullNewRows = async () => {
		const { rows } = await api.getNewChangeLogs(highestSeenId)
		if (!rows.length) return

		rows.sort((a, b) => b.id - a.id)
		highestSeenId = Math.max(highestSeenId, rows[0].id)
		lowestSeenId = Math.min(lowestSeenId, rows[rows.length - 1].id)

		setBuffer(
			produce((draft: ChangeLog[]) => {
				draft.unshift(...rows)

				if (windowStart() > 0) {
					setWindowStart(prev => prev + rows.length)
				}
			})
		)
	}

	const loadInitial = async () => {
		const { rows } = await api.getChangeLogs({ offset: 0, limit: windowSize })
		if (!rows.length) return

		rows.sort((a, b) => b.id - a.id)

		highestSeenId = rows[0].id
		lowestSeenId = rows[rows.length - 1].id

		setBuffer(rows)
		setWindowStart(0)
	}

	const fetchOlder = async (fetchSize = windowSize) => {
		if (lowestSeenId === Infinity) return

		const olderRows: ChangeLog[] = await (await db)
			.select()
			.from(changeLog)
			.where(lt(changeLog.id, lowestSeenId))
			.orderBy(desc(changeLog.id))
			.limit(fetchSize)
			.all()

		if (!olderRows.length) return

		olderRows.sort((a, b) => b.id - a.id)
		lowestSeenId = Math.min(lowestSeenId, olderRows[olderRows.length - 1].id)

		setBuffer(
			produce((draft: ChangeLog[]) => {
				draft.push(...olderRows)
			})
		)
	}

	const slideLeft = () => {
		setWindowStart(prev => Math.max(0, prev - windowSize))
	}

	const slideRight = async () => {
		const desiredStart = windowStart() + windowSize

		if (desiredStart + windowSize > buffer.length) {
			await fetchOlder(windowSize * 2)
		}

		setWindowStart(prev =>
			Math.min(prev + windowSize, Math.max(0, buffer.length - windowSize))
		)
	}

	onMount(async () => {
		await loadInitial()

		unsubscribe = await api.subscribeToChangeLog(
			Comlink.proxy(async () => {
				await pullNewRows()
			})
		)

		onCleanup(() => {
			unsubscribe && unsubscribe()
		})
	})

	return [visibleWindow, { slideLeft, slideRight }] as const
}
