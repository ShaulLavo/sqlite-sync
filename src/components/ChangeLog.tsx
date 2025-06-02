import { createSignal, For, onMount, Show, type Component } from 'solid-js'
import { api } from '../App'
import type { ChangeLog } from '../sqlite/schema'

export const ChangeLogTable: Component<{ db: any }> = props => {
	const [logIdx, setLogIdx] = createSignal(0)
	const [logs, setLogs] = createSignal<ChangeLog[]>([])
	const [expandedRows, setExpandedRows] = createSignal<number[]>([])

	const fetchLogs = async () => {
		const res = await api.getChangeLogsAtCursor(logIdx())
		if (res.rows.length === 0) return
		setLogIdx(i => i + res.rows.length)
		setLogs(current => res.rows.concat(current))
	}

	const toggleRow = (id: number) => {
		setExpandedRows(prev =>
			prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
		)
	}

	const isExpanded = (id: number) => expandedRows().includes(id)

	onMount(async () => {
		await fetchLogs()
		setInterval(() => {
			fetchLogs()
		}, 1000)
	})

	return (
		<>
			<div class="flex justify-between items-center mb-3">
				<h3 class="text-xl font-semibold">Change Log</h3>
				<button
					onClick={() => fetchLogs()}
					class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none"
				>
					Refresh
				</button>
			</div>
			<div class="overflow-x-auto">
				<Show
					when={logs() && logs()!.length}
					fallback={
						<div class="mt-4 text-center text-gray-500">
							{!logs() ? 'Loading...' : 'No change log entries.'}
						</div>
					}
				>
					<table class="min-w-full table-auto border-collapse bg-white shadow-sm rounded-lg overflow-hidden">
						<thead class="bg-gray-50">
							<tr>
								<th class="border-b px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									ID
								</th>
								<th class="border-b px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Table
								</th>
								<th class="border-b px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Operation
								</th>
								<th class="border-b px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Primary Key(s)
								</th>
								<th class="border-b px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Changed At
								</th>
							</tr>
						</thead>
						<tbody class="bg-white divide-y divide-gray-200">
							<For each={logs()}>
								{log => (
									<>
										<tr
											class="hover:bg-gray-50 transition-colors cursor-pointer"
											onClick={() => toggleRow(log.id)}
										>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
												{log.id}
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
												{log.tbl_name}
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
												{log.op_type}
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
												<code class="bg-gray-100 rounded px-1 py-0.5">
													{log.pk_json}
												</code>
											</td>
											<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
												{log.changed_at}
											</td>
										</tr>
										<Show when={isExpanded(log.id)}>
											<tr>
												<td
													colspan="6"
													class="px-6 py-4 bg-gray-50 whitespace-pre-wrap text-sm text-gray-800"
												>
													<strong>Full JSON Payload:</strong>
													<pre>
														{JSON.stringify(JSON.parse(log.row_json), null, 2)}
													</pre>
												</td>
											</tr>
										</Show>
									</>
								)}
							</For>
						</tbody>
					</table>
				</Show>
			</div>
		</>
	)
}
