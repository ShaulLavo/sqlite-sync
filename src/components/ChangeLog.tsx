import { createVirtualList } from '@solid-primitives/virtual'
import { sql } from 'drizzle-orm'
import { createSignal, For, onMount, Show, type Component } from 'solid-js'
import { useDb } from '../context/DbProvider'
import { useChangelog } from '../hooks/useChangelog'
import type { ChangeLog } from '../sqlite/schema'
import * as schema from '../sqlite/schema'
import Button from './ui/Button'

export const ChangeLogTable: Component = () => {
	const { db } = useDb()
	const logs = useChangelog()

	const [expandedId, setExpandedId] = createSignal<number | null>(null)
	const toggleExpanded = (id: number) =>
		expandedId() === id ? setExpandedId(null) : setExpandedId(id)

	let root!: HTMLDivElement
	const [rootHeight, setRootHeight] = createSignal(0)

	const ROW_HEIGHT = 44
	const OVERSCAN = 6

	onMount(() => setRootHeight(500))

	const [getVL, onScroll] = createVirtualList<ChangeLog[]>({
		items: logs,
		rootHeight,
		rowHeight: ROW_HEIGHT,
		overscanCount: OVERSCAN
	})

	const containerHeight = () => getVL().containerHeight
	const viewerTop = () => getVL().viewerTop
	const visibleItems = () => getVL().visibleItems.filter(i => !!i.id)

	const topPad = () => viewerTop()
	const bottomPad = () =>
		Math.max(
			0,
			containerHeight() - topPad() - visibleItems().length * ROW_HEIGHT
		)
	const { format } = new Intl.NumberFormat()

	return (
		<div style={{ height: rootHeight() + 'px' }} class="flex flex-col gap-4">
			<div class="flex items-center gap-4">
				<Button
					onClick={async () => {
						const database = await db
						await database.delete(schema.changeLog).run()
						await database.run(
							sql`DELETE FROM sqlite_sequence WHERE name = ${schema.changeLog}`
						)
						logs.splice(0, logs.length)
					}}
					variant="outline"
					class="text-sm"
				>
					Clear Change Log
				</Button>
				<div class="text-sm text-gray-500 dark:text-gray-400">
					{logs.length} entries
				</div>
			</div>

			<div
				ref={root}
				class="flex-1 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 transition-colors duration-300"
				onScroll={onScroll}
			>
				<table class="min-w-full table-auto border-collapse">
					<thead class="bg-gray-100 dark:bg-gray-800 sticky top-0 z-10 transition-colors duration-300">
						<tr>
							<th class={th}>ID</th>
							<th class={th}>Table</th>
							<th class={th}>Operation</th>
							<th class={th}>Primary&nbsp;Key(s)</th>
							<th class={th}>Changed&nbsp;At</th>
						</tr>
					</thead>

					<tbody class="divide-y divide-gray-200 dark:divide-gray-700">
						{/* top spacer row */}
						<tr style={{ height: `${topPad()}px` }}>
							<td colSpan="5" />
						</tr>

						{/* visible rows */}
						<Show
							when={logs.length > 0}
							fallback={
								<tr>
									<td
										colSpan="5"
										class="px-6 py-4 text-center text-gray-500 dark:text-gray-400"
									>
										Loading or no entries.
									</td>
								</tr>
							}
						>
							<For each={visibleItems()}>
								{log => (
									<>
										<tr
											class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors duration-150"
											onClick={() => toggleExpanded(log.id)}
										>
											<td class={td}>{format(log.id)}</td>
											<td class={td}>{log.tbl_name}</td>
											<td class={td}>
												<span
													class={`px-2 py-1 rounded-full text-xs font-medium ${getOperationClass(
														log.op_type
													)}`}
												>
													{log.op_type}
												</span>
											</td>
											<td class={td}>
												<code class="bg-gray-100 dark:bg-gray-800 rounded px-1.5 py-0.5 text-purple-600 dark:text-purple-400 text-xs">
													{log.pk_json}
												</code>
											</td>
											<td class={td}>{log.changed_at}</td>
										</tr>

										<Show when={expandedId() === log.id}>
											<tr class="bg-gray-50 dark:bg-gray-800/30">
												<td colSpan="5" class="px-6 py-4">
													<pre class="text-xs overflow-auto max-h-64 bg-white dark:bg-gray-900 dark:text-purple-400 p-3 rounded-md border border-gray-200 dark:border-gray-700">
														{JSON.stringify(JSON.parse(log.row_json), null, 2)}
													</pre>
												</td>
											</tr>
										</Show>
									</>
								)}
							</For>
						</Show>

						{/* bottom spacer row */}
						<tr style={{ height: `${bottomPad()}px` }}>
							<td colSpan="5" />
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	)
}

// Helper function to get operation-specific styling
function getOperationClass(operation: string) {
	switch (operation) {
		case 'INSERT':
			return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
		case 'UPDATE':
			return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
		case 'DELETE':
			return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
		default:
			return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300'
	}
}

const th =
	'border-b border-gray-200 dark:border-gray-700 px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-colors duration-300'
const td =
	'px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200 transition-colors duration-300'
