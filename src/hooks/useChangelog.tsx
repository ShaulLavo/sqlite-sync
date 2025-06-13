import * as Comlink from 'comlink'
import { batch, onCleanup, onMount } from 'solid-js'
import { createMutable } from 'solid-js/store'
import { useDb } from '../context/DbProvider'
import { changeLog, type ChangeLog } from '../sqlite/schema'
import { desc } from 'drizzle-orm'

export const useChangelog = () => {
	const { api, db } = useDb()
	const logs = createMutable<ChangeLog[]>([])
	const N = 1000

	let unsubscribe: (() => void) | undefined

	onMount(async () => {
		const database = await db

		const recent = await database
			.select()
			.from(changeLog)
			.orderBy(desc(changeLog.id))
			.limit(N)
			.all()

		logs.splice(0, logs.length, ...recent)

		unsubscribe = await api.subscribeToChangeLog(
			Comlink.proxy((incoming: ChangeLog[]) => {
				const toAdd = incoming.length > N ? incoming.slice(-N) : incoming
				batch(() => {
					logs.unshift(...toAdd.reverse())
					if (logs.length > N) logs.splice(N)
				})
			})
		)
	})

	onCleanup(() => {
		unsubscribe?.()
	})

	return logs
}
