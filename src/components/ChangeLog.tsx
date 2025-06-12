import { createVirtualList } from '@solid-primitives/virtual'
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
	const visibleItems = () => getVL().visibleItems

	const topPad = () => viewerTop()
	const bottomPad = () =>
		Math.max(
			0,
			containerHeight() - topPad() - visibleItems().length * ROW_HEIGHT
		)

	return (
		<div
			style={{ height: rootHeight() + 'px' }}
			class="p-4 flex flex-col gap-4"
		>
			<div class="flex items-center gap-4">
				<h3 class="text-xl font-semibold">Change&nbsp;Log</h3>
				<Button
					onClick={async () => {
						const database = await db
						await database.delete(schema.changeLog).run()
						logs.splice(0, logs.length)
					}}
				>
					Clear Change Log
				</Button>
			</div>

			<div ref={root} class="flex-1 overflow-y-auto" onScroll={onScroll}>
				<table class="min-w-full table-auto border-collapse bg-white shadow-sm rounded-lg">
					<thead class="bg-gray-50 sticky top-0 z-10">
						<tr>
							<th class={th}>ID</th>
							<th class={th}>Table</th>
							<th class={th}>Operation</th>
							<th class={th}>Primary&nbsp;Key(s)</th>
							<th class={th}>Changed&nbsp;At</th>
						</tr>
					</thead>

					<tbody class="divide-y divide-gray-200">
						{/* top spacer row */}
						<tr style={{ height: `${topPad()}px` }}>
							<td colSpan="5" />
						</tr>

						{/* visible rows */}
						<Show
							when={logs.length > 0}
							fallback={
								<tr>
									<td colSpan="5" class="px-6 py-4 text-center text-gray-500">
										Loading or no entries.
									</td>
								</tr>
							}
						>
							<For each={visibleItems()}>
								{log => (
									<>
										<tr
											class="cursor-pointer hover:bg-gray-100"
											onClick={() => toggleExpanded(log.id)}
										>
											<td class={td}>{log.id}</td>
											<td class={td}>{log.tbl_name}</td>
											<td class={td}>{log.op_type}</td>
											<td class={td}>
												<code class="bg-gray-100 rounded px-1 py-0.5">
													{log.pk_json}
												</code>
											</td>
											<td class={td}>{log.changed_at}</td>
										</tr>

										<Show when={expandedId() === log.id}>
											<tr class="bg-gray-50">
												<td colSpan="5" class="px-6 py-4">
													<pre class="text-xs overflow-auto max-h-64">
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

const th =
	'border-b px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
const td = 'px-6 py-4 whitespace-nowrap text-sm text-gray-900'
