import { eq } from 'drizzle-orm'
import { createSignal, For, type Component } from 'solid-js'
import { useDb } from '../../context/DbProvider'
import type { User } from '../../sqlite/schema'
import * as schema from '../../sqlite/schema'
import Button from '../ui/Button'

export const UsersTable: Component<{
	users: User[]
	loading: boolean
	onDelete: (id: number) => void
	setSuccess: (msg: string | null) => void
	setError: (msg: string | null) => void
	setLoading: (loading: boolean) => void
	error: string | null
	success: string | null
}> = props => {
	const { db } = useDb()

	const [editingNameIds, setEditingNameIds] = createSignal<Set<number>>(
		new Set()
	)

	const [editingEmailIds, setEditingEmailIds] = createSignal<Set<number>>(
		new Set()
	)

	const [editedUsers, setEditedUsers] = createSignal<
		Record<number, { name?: string; email?: string }>
	>({})
	const updateName = async (id: number, newName: string) => {
		if (!newName.trim()) return
		props.setLoading(true)
		props.setError(null)
		props.setSuccess(null)
		try {
			await (await db)
				.update(schema.users)
				.set({ name: newName.trim() })
				.where(eq(schema.users.id, id))
			props.setSuccess('Name updated.')
		} catch (err: any) {
			console.error('updateName failed', err)
			props.setError(err.message || 'Unknown error')
		} finally {
			props.setLoading(false)
		}
	}

	const updateEmail = async (id: number, newEmail: string) => {
		if (!newEmail.trim()) return
		props.setLoading(true)
		props.setError(null)
		props.setSuccess(null)
		try {
			await (await db)
				.update(schema.users)
				.set({ email: newEmail.trim() })
				.where(eq(schema.users.id, id))
			props.setSuccess('Email updated.')
		} catch (err: any) {
			console.error('updateEmail failed', err)
			props.setError(err.message || 'Unknown error')
		} finally {
			props.setLoading(false)
		}
	}

	const startEditingName = (id: number) => {
		setEditingNameIds(prev => {
			const copy = new Set(prev)
			copy.add(id)
			return copy
		})
	}
	const stopEditingName = (id: number) => {
		setEditingNameIds(prev => {
			const copy = new Set(prev)
			copy.delete(id)
			return copy
		})
	}

	const startEditingEmail = (id: number) => {
		setEditingEmailIds(prev => {
			const copy = new Set(prev)
			copy.add(id)
			return copy
		})
	}
	const stopEditingEmail = (id: number) => {
		setEditingEmailIds(prev => {
			const copy = new Set(prev)
			copy.delete(id)
			return copy
		})
	}

	const onNameInput = (id: number, value: string) => {
		const originalName = props.users.find(u => u.id === id)?.name ?? ''
		const trimmed = value
		setEditedUsers(prev => {
			const copy = { ...prev }
			if (trimmed !== originalName) {
				const entry = copy[id] || {}
				entry.name = trimmed
				copy[id] = entry
			} else {
				if (copy[id]?.name !== undefined) {
					const { email } = copy[id]
					if (email !== undefined) {
						copy[id] = { email }
					} else {
						delete copy[id]
					}
				}
			}
			return copy
		})
	}

	const onEmailInput = (id: number, value: string) => {
		const originalEmail = props.users.find(u => u.id === id)?.email ?? ''
		const trimmed = value
		setEditedUsers(prev => {
			const copy = { ...prev }
			if (trimmed !== originalEmail) {
				const entry = copy[id] || {}
				entry.email = trimmed
				copy[id] = entry
			} else {
				if (copy[id]?.email !== undefined) {
					const { name } = copy[id]
					if (name !== undefined) {
						copy[id] = { name }
					} else {
						delete copy[id]
					}
				}
			}
			return copy
		})
	}

	const saveAll = () => {
		const batch = editedUsers()
		for (const idStr in batch) {
			const id = Number(idStr)
			const change = batch[id]

			if (change.name !== undefined) {
				const newName = change.name.trim()
				const orig = props.users.find(u => u.id === id)?.name ?? ''
				if (newName && newName !== orig) {
					updateName(id, newName)
				}
			}

			if (change.email !== undefined) {
				const newEmail = change.email.trim()
				const orig = props.users.find(u => u.id === id)?.email ?? ''
				if (
					newEmail &&
					newEmail !== orig &&
					/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)
				) {
					updateEmail(id, newEmail)
				}
			}
		}

		setEditedUsers({})
		setEditingNameIds(new Set<number>())
		setEditingEmailIds(new Set<number>())
	}

	const cancelAll = () => {
		setEditedUsers({})
		setEditingNameIds(new Set<number>())
		setEditingEmailIds(new Set<number>())
	}

	return (
		<>
			{props.error && (
				<p class="text-red-500 dark:text-red-400 mb-2">Error: {props.error}</p>
			)}
			{props.success && (
				<p class="text-green-600 dark:text-green-400 mb-2">{props.success}</p>
			)}
			<h3 class="text-xl font-semibold mb-3 text-gray-800 dark:text-white">
				All Users
			</h3>
			<div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
				<table class="min-w-full table-auto border-collapse bg-white dark:bg-gray-800 shadow-sm overflow-hidden transition-colors duration-300">
					<thead class="bg-gray-50 dark:bg-gray-700">
						<tr>
							<th class="border-b border-gray-200 dark:border-gray-600 px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
								Avatar
							</th>
							<th class="border-b border-gray-200 dark:border-gray-600 px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
								ID
							</th>
							<th class="border-b border-gray-200 dark:border-gray-600 px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
								Name
							</th>
							<th class="border-b border-gray-200 dark:border-gray-600 px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
								Email
							</th>
							<th class="border-b border-gray-200 dark:border-gray-600 px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
								Status
							</th>
							<th class="border-b border-gray-200 dark:border-gray-600 px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
								Actions
							</th>
						</tr>
					</thead>
					<tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
						<For each={props.users}>
							{user => {
								const isNameEditing = () => editingNameIds().has(user.id)
								const isEmailEditing = () => editingEmailIds().has(user.id)
								const pending = () => editedUsers()[user.id] || {}
								const displayedName = () => pending().name ?? user.name
								const displayedEmail = () => pending().email ?? user.email

								return (
									<tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
										{/* Avatar */}
										<td class="px-6 py-4 whitespace-nowrap">
											<div class="w-10 h-10 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center overflow-hidden">
												{user.picture ? (
													<img
														src={user.picture || '/placeholder.svg'}
														alt="Avatar"
														class="w-full h-full object-cover"
													/>
												) : (
													<span class="text-sm font-medium text-gray-600 dark:text-gray-300">
														{user.name[0]}
													</span>
												)}
											</div>
										</td>

										{/* ID */}
										<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">
											{user.id}
										</td>

										{/* Name */}
										<td class="px-6 py-4 whitespace-nowrap">
											{isNameEditing() ? (
												<input
													class="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-purple-500 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
													type="text"
													value={displayedName()}
													onInput={e =>
														onNameInput(user.id, e.currentTarget.value)
													}
													onBlur={() => stopEditingName(user.id)}
													autofocus
												/>
											) : (
												<span
													class="text-sm font-medium text-gray-900 dark:text-gray-200 cursor-pointer hover:text-purple-600 dark:hover:text-purple-400"
													onDblClick={() => startEditingName(user.id)}
												>
													{displayedName()}
												</span>
											)}
										</td>

										{/* Email */}
										<td class="px-6 py-4 whitespace-nowrap">
											{isEmailEditing() ? (
												<input
													class="w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-purple-500 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
													type="email"
													value={displayedEmail()}
													onInput={e =>
														onEmailInput(user.id, e.currentTarget.value)
													}
													onBlur={() => stopEditingEmail(user.id)}
													autofocus
												/>
											) : (
												<span
													class="text-sm text-gray-900 dark:text-gray-200 cursor-pointer hover:text-purple-600 dark:hover:text-purple-400"
													onDblClick={() => startEditingEmail(user.id)}
												>
													{displayedEmail()}
												</span>
											)}
										</td>

										{/* Status */}
										<td class="px-6 py-4 whitespace-nowrap">
											<span
												class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
													user.is_active
														? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
														: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
												}`}
											>
												{user.is_active ? 'Active' : 'Inactive'}
											</span>
										</td>

										{/* Actions */}
										<td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
											<button
												class="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-50 transition-colors"
												onClick={() => props.onDelete(user.id)}
												disabled={props.loading}
											>
												Delete
											</button>
										</td>
									</tr>
								)
							}}
						</For>
					</tbody>
				</table>
			</div>

			{/* Footer: Save All / Cancel All */}
			<div class="mt-4 flex flex-wrap items-center gap-4">
				<Button
					onClick={saveAll}
					disabled={props.loading || Object.keys(editedUsers()).length === 0}
					class="bg-purple-600 hover:bg-purple-700 text-white"
				>
					Save All
				</Button>
				<Button
					onClick={cancelAll}
					disabled={Object.keys(editedUsers()).length === 0}
					variant="outline"
				>
					Cancel All
				</Button>
				<p class="text-sm text-gray-600 dark:text-gray-400">
					You have {Object.keys(editedUsers()).length} pending change
					{Object.keys(editedUsers()).length !== 1 ? 's' : ''}.
				</p>
			</div>

			<div class="mt-4 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
				<p>
					💡 <strong>Tip:</strong> Double‐click any name or email to start
					editing. Once you've made changes, click "Save All" to batch‐commit.
				</p>
			</div>
		</>
	)
}
