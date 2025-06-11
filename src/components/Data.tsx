import { createEffect, createResource, createSignal, For } from 'solid-js'
import { useDb } from '../context/DbProvider'
import type { Migration, Post } from '../sqlite/schema'
import * as schema from '../sqlite/schema'
import { hasOPFS, isPersisted } from '../utils/storage'
import { useUsers } from '../hooks/useLiveUsers'
import { downloadDatabase } from '../utils/download'
import Button from './ui/Button'

export const Data = () => {
	const { api, db } = useDb()
	const [reply, setReply] = createSignal<string>('No reply yet')
	const users = useUsers()
	const [posts, setPosts] = createSignal<Post[]>([])
	const [migrations, setMigrations] = createSignal<Migration[]>([])
	const [loading, setLoading] = createSignal<boolean>(true)
	const [error, setError] = createSignal<string | null>(null)
	// New resources
	const [isOpfs] = createResource(hasOPFS)
	const [hasPersistence] = createResource(isPersisted)

	// createEffect(async () => {
	// 	if (isOpfs() && !hasPersistence()) {
	// 		console.log('Asking for persistent storage support…')
	// 		setHasPersistence(await navigator.storage.persist())
	// 	}
	// })

	createEffect(async () => {
		try {
			const pingResult = await api.ping('Hello from Main!')
			setReply(pingResult)
		} catch (err) {
			console.error('Main: ping failed:', err)
			setReply('Worker ping failed')
		}

		try {
			await api.clientReady
			const migrationsResult = await (await db)
				.select()
				.from(schema.migrations)
				.all()
			const postsList = await (await db).select().from(schema.posts).all()

			setMigrations(migrationsResult)
			setPosts(postsList)
		} catch (err: any) {
			console.error('Main: error querying tables:', err)
			setError(err.message || 'Unknown error')
		} finally {
			setLoading(false)
		}
	})

	return (
		<div class="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-6">
			<h1 class="text-3xl font-bold mb-4">SQLite Demo (via Comlink Worker)</h1>
			<Button
				class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200 shadow-md text-base leading-relaxed mb-6"
				onClick={async () => await downloadDatabase(api)}
			>
				Download DB
			</Button>
			<p class="mb-1">
				<strong>Worker ping reply:</strong> {reply()}
			</p>

			{/* OPFS availability */}
			<p class="mb-1">
				<strong>OPFS enabled:</strong>{' '}
				{isOpfs.loading ? 'Checking…' : isOpfs() ? 'Yes' : 'No'}
			</p>

			{/* Persistence status */}
			<p class="mb-4">
				<strong>Persistent storage:</strong>{' '}
				{hasPersistence.loading
					? 'Checking…'
					: hasPersistence()
					? 'Granted'
					: 'Unavailable'}
			</p>

			{loading() && (
				<p class="text-gray-600 italic">Loading data from the database…</p>
			)}

			{error() && <p class="text-red-500 mb-4">Error: {error()}</p>}

			{!loading() && !error() && (
				<>
					<section class="mb-6">
						<h2 class="text-2xl font-semibold mb-2">Migrations</h2>
						{migrations().length === 0 ? (
							<p class="text-gray-500">No migrations applied.</p>
						) : (
							<ul class="space-y-2">
								<For each={migrations()}>
									{mig => (
										<li class="border border-gray-200 rounded-lg p-3">
											<p class="font-medium">{mig.name}</p>
											<p class="text-sm text-gray-600">
												Applied at: {mig.applied_at}
											</p>
										</li>
									)}
								</For>
							</ul>
						)}
					</section>

					<section class="mb-6">
						<h2 class="text-2xl font-semibold mb-2">Users</h2>
						{users.length === 0 ? (
							<p class="text-gray-500">No users found.</p>
						) : (
							<ul class="list-disc pl-5">
								<For each={users}>
									{user => (
										<li class="mb-1">
											<span class="font-medium">ID {user.id}:</span> {user.name}{' '}
											<span class="text-gray-600">({user.email})</span>
										</li>
									)}
								</For>
							</ul>
						)}
					</section>

					<section>
						<h2 class="text-2xl font-semibold mb-2">Posts</h2>
						{posts().length === 0 ? (
							<p class="text-gray-500">No posts found.</p>
						) : (
							<ul class="space-y-4">
								<For each={posts()}>
									{post => (
										<li class="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition">
											<h3 class="text-xl font-medium">{post.title}</h3>
											<p class="text-gray-700 mt-1">{post.body}</p>
											<p class="text-sm text-gray-500 mt-2">
												Author ID: {post.authorId} | Post ID: {post.id}
											</p>
										</li>
									)}
								</For>
							</ul>
						)}
					</section>
				</>
			)}
		</div>
	)
}
