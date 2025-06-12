import * as Comlink from 'comlink'
import { onCleanup, onMount } from 'solid-js'
import { createMutable } from 'solid-js/store'
import { useDb } from '../context/DbProvider'
import type { ChangeLog } from '../sqlite/schema'

export const useChangelog = () => {
	const { api } = useDb()
	const logs = createMutable<ChangeLog[]>([])

	onMount(async () => {
		const unsubscribe = await api.subscribeToChangeLog(
			Comlink.proxy((incoming: ChangeLog[]) => {
				logs.unshift(...incoming)
				if (logs.length > 1000) {
					logs.splice(200)
				}
			})
		)

		onCleanup(unsubscribe)
	})

	return logs
}
