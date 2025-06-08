import { createSignal, For, Show, type Component } from 'solid-js'
import type { ChangeLog } from '../sqlite/schema'
import { useLiveChangeLog } from '../hooks/useLiveChangeLog'
import { useDb } from '../context/DbProvider'
import * as schema from '../sqlite/schema'
import { eq } from 'drizzle-orm'
export const ChangeLogTable: Component = () => {
	const { db } = useDb()
	const [logs, { slideLeft, slideRight }] = useLiveChangeLog(15)

	const [visibleRawId, setVisibleRawId] = createSignal<number | null>(null)
	const toggleRaw = (id: number) => {
		visibleRawId() === id ? setVisibleRawId(null) : setVisibleRawId(id)
	}

	return (
		<div class="p-4 h-screen overflow-hidden flex flex-col gap-4">
			<div class="mb-3">
				<h3 class="text-xl font-semibold">Change Log</h3>
			</div>
			<button
				class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200 shadow-md text-base leading-relaxed mb-6"
				onClick={async () => {
					await (await db)
						.delete(schema.changeLog)
						.where(eq(schema.changeLog.id, schema.changeLog.id))
						.execute()
					window.location.reload()
				}}
			>
				Clear ChangeLog
			</button>
			<div class="overflow-y-auto h-full">
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
						<Show
							when={logs().length > 0}
							fallback={
								<tr>
									<td colspan="5" class="px-6 py-4 text-center text-gray-500">
										Loading or no entries.
									</td>
								</tr>
							}
						>
							<For each={logs()}>
								{(log: ChangeLog) => (
									<>
										<tr
											class="cursor-pointer hover:bg-gray-100"
											onClick={() => toggleRaw(log.id)}
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
										<Show when={visibleRawId() === log.id}>
											<tr class="bg-gray-50">
												<td colspan="5" class="px-6 py-4">
													<pre class="text-xs text-gray-800 overflow-auto max-h-64">
														{JSON.stringify(JSON.parse(log.row_json), null, 2)}
													</pre>
												</td>
											</tr>
										</Show>
									</>
								)}
							</For>
						</Show>
					</tbody>
				</table>
			</div>

			<div class="flex justify-between items-center mt-4">
				<button
					onClick={slideLeft}
					class="px-4 py-2 bg-gray-300 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Prev
				</button>

				<button
					onClick={slideRight}
					class="px-4 py-2 bg-gray-300 text-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Next
				</button>
			</div>
		</div>
	)
}
