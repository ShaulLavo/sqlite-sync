import {
	createEffect,
	createSignal,
	For,
	Show,
	type Accessor,
	type Component
} from 'solid-js'
import type { User, Post } from '../../sqlite/schema'

export const UserProfileModal: Component<{
	user: User | null
	posts: Post[]
	isOpen: Accessor<boolean>
	loading: boolean
	onClose: () => void
	onUpdateUser: (id: number, updates: Partial<User>) => void
	onCreatePost: (userId: number, title: string, content: string) => void
	onUpdatePost: (id: number, title: string, content: string) => void
	onDeletePost: (id: number) => void
}> = props => {
	const [editingUser, setEditingUser] = createSignal(false)
	const [userForm, setUserForm] = createSignal<Partial<User>>({})

	const [showNewPost, setShowNewPost] = createSignal(false)
	const [newPostTitle, setNewPostTitle] = createSignal('')
	const [newPostContent, setNewPostContent] = createSignal('')

	const [editingPostId, setEditingPostId] = createSignal<number | null>(null)
	const [editPostTitle, setEditPostTitle] = createSignal('')
	const [editPostContent, setEditPostContent] = createSignal('')
	createEffect(() => {
		console.log(props.isOpen())
	})
	const handleUserEdit = () => {
		if (!props.user) return
		setUserForm({
			name: props.user.name,
			email: props.user.email,
			bio: props.user.bio || '',
			location: props.user.location || '',
			picture: props.user.picture || ''
		})
		setEditingUser(true)
	}
	const isValidUrl = (url: string) => {
		try {
			const parsed = new URL(url)
			return ['http:', 'https:'].includes(parsed.protocol)
		} catch {
			return false
		}
	}
	const saveUserChanges = () => {
		if (!props.user) return
		const picture = userForm().picture || ''
		if (!isValidUrl(picture)) console.log('Invalid picture URL:', picture)

		props.onUpdateUser(props.user.id, userForm())
		setEditingUser(false)
	}

	const createPost = () => {
		if (!props.user || !newPostTitle().trim() || !newPostContent().trim())
			return
		props.onCreatePost(
			props.user.id,
			newPostTitle().trim(),
			newPostContent().trim()
		)
		setNewPostTitle('')
		setNewPostContent('')
		setShowNewPost(false)
	}

	const startEditPost = (post: Post) => {
		setEditingPostId(post.id)
		setEditPostTitle(post.title)
		setEditPostContent(post.body)
	}

	const savePostChanges = (postId: number) => {
		if (!editPostTitle().trim() || !editPostContent().trim()) return
		props.onUpdatePost(postId, editPostTitle().trim(), editPostContent().trim())
		setEditingPostId(null)
	}

	const handleBackdropClick = (e: MouseEvent) => {
		if (e.target === e.currentTarget) {
			props.onClose()
		}
	}

	return (
		<Show when={props.isOpen() && props.user}>
			<div
				class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
				onClick={handleBackdropClick}
			>
				<div class="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
					{/* Header */}
					<div class="flex items-center justify-between p-6 border-b">
						<h2 class="text-2xl font-bold">User Profile</h2>
						<button
							onClick={props.onClose}
							class="text-gray-500 hover:text-gray-700 text-2xl font-bold"
						>
							×
						</button>
					</div>

					<div class="flex-1 overflow-y-auto p-6">
						<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
							{/* User Info Section */}
							<div>
								<div class="flex items-center justify-between mb-4">
									<h3 class="text-xl font-semibold">User Information</h3>
									<button
										onClick={handleUserEdit}
										class="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600"
										disabled={props.loading}
									>
										Edit
									</button>
								</div>

								<Show when={!editingUser()}>
									<div class="space-y-4">
										<div class="flex items-center space-x-4">
											<div class="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
												<Show
													when={props.user?.picture}
													fallback={
														<span class="text-2xl font-bold text-gray-600">
															{props.user?.name?.[0] || '?'}
														</span>
													}
												>
													<img
														src={props.user?.picture || '/placeholder.svg'}
														alt="Profile"
														class="w-full h-full object-cover"
													/>
												</Show>
											</div>
											<div>
												<h4 class="text-lg font-semibold">
													{props.user?.name}
												</h4>
												<p class="text-gray-600">{props.user?.email}</p>
											</div>
										</div>

										<div class="space-y-2">
											<Show when={props.user?.bio}>
												<div>
													<label class="block text-sm font-medium text-gray-700">
														Bio
													</label>
													<p class="text-gray-900">{props.user?.bio}</p>
												</div>
											</Show>

											<Show when={props.user?.location}>
												<div>
													<label class="block text-sm font-medium text-gray-700">
														Location
													</label>
													<p class="text-gray-900">{props.user?.location}</p>
												</div>
											</Show>

											<div>
												<label class="block text-sm font-medium text-gray-700">
													Joined
												</label>
												<p class="text-gray-900">
													{new Date(
														props.user?.createdAt || ''
													).toLocaleDateString()}
												</p>
											</div>

											<div>
												<label class="block text-sm font-medium text-gray-700">
													Status
												</label>
												<span
													class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
														props.user?.isActive
															? 'bg-green-100 text-green-800'
															: 'bg-red-100 text-red-800'
													}`}
												>
													{props.user?.isActive ? 'Active' : 'Inactive'}
												</span>
											</div>
										</div>
									</div>
								</Show>

								<Show when={editingUser()}>
									<div class="space-y-4">
										<div>
											<label class="block text-sm font-medium text-gray-700 mb-1">
												Name
											</label>
											<input
												type="text"
												value={userForm().name || ''}
												onInput={e =>
													setUserForm(prev => ({
														...prev,
														name: e.currentTarget.value
													}))
												}
												class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
											/>
										</div>

										<div>
											<label class="block text-sm font-medium text-gray-700 mb-1">
												Email
											</label>
											<input
												type="email"
												value={userForm().email || ''}
												onInput={e =>
													setUserForm(prev => ({
														...prev,
														email: e.currentTarget.value
													}))
												}
												class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
											/>
										</div>

										<div>
											<label class="block text-sm font-medium text-gray-700 mb-1">
												Picture URL
											</label>
											<input
												type="url"
												value={userForm().picture || ''}
												onInput={e =>
													setUserForm(prev => ({
														...prev,
														picture: e.currentTarget.value
													}))
												}
												class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
												placeholder="https://example.com/avatar.jpg"
											/>
										</div>

										<div>
											<label class="block text-sm font-medium text-gray-700 mb-1">
												Bio
											</label>
											<textarea
												value={userForm().bio || ''}
												onInput={e =>
													setUserForm(prev => ({
														...prev,
														bio: e.currentTarget.value
													}))
												}
												class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
												rows="3"
												placeholder="Tell us about yourself..."
											/>
										</div>

										<div>
											<label class="block text-sm font-medium text-gray-700 mb-1">
												Location
											</label>
											<input
												type="text"
												value={userForm().location || ''}
												onInput={e =>
													setUserForm(prev => ({
														...prev,
														location: e.currentTarget.value
													}))
												}
												class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
												placeholder="City, Country"
											/>
										</div>

										<div class="flex space-x-2">
											<button
												onClick={saveUserChanges}
												class="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
												disabled={props.loading}
											>
												Save
											</button>
											<button
												onClick={() => setEditingUser(false)}
												class="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
											>
												Cancel
											</button>
										</div>
									</div>
								</Show>
							</div>

							{/* Posts Section */}
							<div>
								<div class="flex items-center justify-between mb-4">
									<h3 class="text-xl font-semibold">
										Posts ({props.posts.length})
									</h3>
									<button
										onClick={() => setShowNewPost(!showNewPost())}
										class="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600"
										disabled={props.loading}
									>
										{showNewPost() ? 'Cancel' : 'New Post'}
									</button>
								</div>

								<Show when={showNewPost()}>
									<div class="mb-4 p-4 border rounded-lg bg-gray-50">
										<div class="space-y-3">
											<input
												type="text"
												placeholder="Post title..."
												value={newPostTitle()}
												onInput={e => setNewPostTitle(e.currentTarget.value)}
												class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
											/>
											<textarea
												placeholder="What's on your mind?"
												value={newPostContent()}
												onInput={e => setNewPostContent(e.currentTarget.value)}
												class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
												rows="3"
											/>
											<button
												onClick={createPost}
												class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
												disabled={
													props.loading ||
													!newPostTitle().trim() ||
													!newPostContent().trim()
												}
											>
												Create Post
											</button>
										</div>
									</div>
								</Show>

								<div class="space-y-4 max-h-96 overflow-y-auto">
									<For
										each={props.posts}
										fallback={<p class="text-gray-500 italic">No posts yet.</p>}
									>
										{post => (
											<div class="border rounded-lg p-4 bg-white shadow-sm">
												<Show when={editingPostId() !== post.id}>
													<div>
														<div class="flex items-center justify-between mb-2">
															<h4 class="font-semibold text-lg">
																{post.title}
															</h4>
															<div class="flex space-x-2">
																<button
																	onClick={() => startEditPost(post)}
																	class="text-blue-500 hover:text-blue-700 text-sm"
																>
																	Edit
																</button>
																<button
																	onClick={() => props.onDeletePost(post.id)}
																	class="text-red-500 hover:text-red-700 text-sm"
																	disabled={props.loading}
																>
																	Delete
																</button>
															</div>
														</div>
														<p class="text-gray-700 mb-2">{post.body}</p>
														<p class="text-xs text-gray-500">
															{new Date(post.createdAt).toLocaleString()}
															{post.updatedAt !== post.createdAt && ' (edited)'}
														</p>
													</div>
												</Show>

												<Show when={editingPostId() === post.id}>
													<div class="space-y-3">
														<input
															type="text"
															value={editPostTitle()}
															onInput={e =>
																setEditPostTitle(e.currentTarget.value)
															}
															class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
														/>
														<textarea
															value={editPostContent()}
															onInput={e =>
																setEditPostContent(e.currentTarget.value)
															}
															class="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
															rows="3"
														/>
														<div class="flex space-x-2">
															<button
																onClick={() => savePostChanges(post.id)}
																class="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 text-sm"
																disabled={
																	props.loading ||
																	!editPostTitle().trim() ||
																	!editPostContent().trim()
																}
															>
																Save
															</button>
															<button
																onClick={() => setEditingPostId(null)}
																class="px-3 py-1 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm"
															>
																Cancel
															</button>
														</div>
													</div>
												</Show>
											</div>
										)}
									</For>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</Show>
	)
}
