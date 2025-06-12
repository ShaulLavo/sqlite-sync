import * as Comlink from 'comlink'
import { createSignal, onCleanup, onMount } from 'solid-js'
import { useDb } from '../context/DbProvider'
import type { ChangeLog } from '../sqlite/schema'
import { createMutable } from 'solid-js/store'

export const useChangelog = () => {
	const { api } = useDb()
	const logs = createMutable<ChangeLog[]>([])

	onMount(async () => {
		const unsubscribe = await api.subscribeToChangeLog(
			Comlink.proxy((incoming: ChangeLog[]) => {
				logs.unshift(...incoming)
				if (logs.length > 1000) {
					logs.slice(0, 200)
				}
			})
		)

		onCleanup(unsubscribe)
	})

	return logs
}
