import { createSignal, For, type Component } from 'solid-js'
import type { User } from '../../sqlite/schema'
export const UsersTable: Component<{
	users: User[]
	loading: boolean
	onDelete: (id: number) => void
	onUpdateName: (id: number, newName: string) => void
	onUpdateEmail: (id: number, newEmail: string) => void
	onRowClick: (user: User) => void
}> = props => {
	const [editingNameId, setEditingNameId] = createSignal<number | null>(null)
	const [editingName, setEditingName] = createSignal('')
	const [editingEmailId, setEditingEmailId] = createSignal<number | null>(null)
	const [editingEmail, setEditingEmail] = createSignal('')

	const commitName = (id: number) => {
		const newName = editingName().trim()
		setEditingNameId(null)
		if (newName) props.onUpdateName(id, newName)
	}

	const commitEmail = (id: number) => {
		const newEmail = editingEmail().trim()
		if (!newEmail.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) {
			throw new Error('Invalid email format')
		}
		setEditingEmailId(null)
		if (newEmail) props.onUpdateEmail(id, newEmail)
	}

	const handleRowClick = (user: User, e: MouseEvent) => {
		// Don't trigger row click if clicking on interactive elements
		const target = e.target as HTMLElement
		if (
			target.tagName === 'INPUT' ||
			target.tagName === 'BUTTON' ||
			target.tagName === 'SPAN'
		) {
			return
		}
		props.onRowClick(user)
	}

	const handleEditClick = (e: MouseEvent) => {
		e.stopPropagation() // Prevent row click when editing
	}

	return (
		<>
			<h3 class="text-xl font-semibold mb-3">All Users</h3>
			<div class="overflow-x-auto">
				<table class="min-w-full table-auto border-collapse bg-white shadow-sm rounded-lg overflow-hidden">
					<thead class="bg-gray-50">
						<tr>
							<th class="border-b px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Avatar
							</th>
							<th class="border-b px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								ID
							</th>
							<th class="border-b px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Name
							</th>
							<th class="border-b px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Email
							</th>
							<th class="border-b px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Status
							</th>
							<th class="border-b px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Actions
							</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						<For each={props.users}>
							{user => (
								<tr
									class="hover:bg-gray-50 cursor-pointer transition-colors"
									onClick={e => handleRowClick(user, e)}
								>
									{/* Avatar */}
									<td class="px-6 py-4 whitespace-nowrap">
										<div class="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
											{user.picture ? (
												<img
													src={user.picture || '/placeholder.svg'}
													alt="Avatar"
													class="w-full h-full object-cover"
												/>
											) : (
												<span class="text-sm font-medium text-gray-600">
													{user.name[0]}
												</span>
											)}
										</div>
									</td>

									{/* ID */}
									<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
										{user.id}
									</td>

									{/* Name */}
									<td class="px-6 py-4 whitespace-nowrap">
										{editingNameId() === user.id ? (
											<input
												class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
												value={editingName()}
												onInput={e => setEditingName(e.currentTarget.value)}
												onBlur={() => commitName(user.id)}
												onClick={handleEditClick}
												autofocus
											/>
										) : (
											<div class="flex flex-col">
												<span
													class="text-sm font-medium text-gray-900 cursor-pointer hover:text-blue-600"
													onDblClick={e => {
														e.stopPropagation()
														setEditingNameId(user.id)
														setEditingName(user.name)
													}}
												>
													{user.name}
												</span>
												{user.bio && (
													<span class="text-xs text-gray-500 truncate max-w-xs">
														{user.bio}
													</span>
												)}
											</div>
										)}
									</td>

									{/* Email */}
									<td class="px-6 py-4 whitespace-nowrap">
										{editingEmailId() === user.id ? (
											<input
												class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
												value={editingEmail()}
												onInput={e => setEditingEmail(e.currentTarget.value)}
												onBlur={() => commitEmail(user.id)}
												onClick={handleEditClick}
												type="email"
												autofocus
											/>
										) : (
											<div class="flex flex-col">
												<span
													class="text-sm text-gray-900 cursor-pointer hover:text-blue-600"
													onDblClick={e => {
														e.stopPropagation()
														setEditingEmailId(user.id)
														setEditingEmail(user.email)
													}}
												>
													{user.email}
												</span>
												{user.location && (
													<span class="text-xs text-gray-500">
														{user.location}
													</span>
												)}
											</div>
										)}
									</td>

									{/* Status */}
									<td class="px-6 py-4 whitespace-nowrap">
										<span
											class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
												user.isActive
													? 'bg-green-100 text-green-800'
													: 'bg-red-100 text-red-800'
											}`}
										>
											{user.isActive ? 'Active' : 'Inactive'}
										</span>
									</td>

									{/* Actions */}
									<td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
										<button
											class="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 transition-colors"
											onClick={e => {
												e.stopPropagation()
												props.onDelete(user.id)
											}}
											disabled={props.loading}
										>
											Delete
										</button>
									</td>
								</tr>
							)}
						</For>
					</tbody>
				</table>
			</div>

			<div class="mt-4 text-sm text-gray-600">
				<p>
					💡 <strong>Tip:</strong> Click on a row to view user profile and
					posts. Double-click name or email to edit inline.
				</p>
			</div>
		</>
	)
}
