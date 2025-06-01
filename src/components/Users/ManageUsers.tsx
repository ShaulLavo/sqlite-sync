import { eq } from 'drizzle-orm'
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { createResource, createSignal, onMount, type Component } from 'solid-js'
import type { User } from '../../sqlite/schema'
import * as schema from '../../sqlite/schema'
import { AddUserForm } from './AddUser'
import { UsersTable } from './UserTable'
import { users as userSchema } from '../../sqlite/schema'
import { UserProfileModal } from './UserProfileModal'
function getRandomRobot(index: number): string {
	const imageNumber = index % 7
	return `/robots/${imageNumber}.png`
}

const mockUsers: User[] = [
	{
		id: 1,
		name: 'Alice Johnson',
		email: 'alice@example.com',
		picture: getRandomRobot(1),
		bio: 'Software engineer passionate about web development',
		location: 'San Francisco, CA',
		createdAt: '2023-01-15T10:30:00Z',
		isActive: true
	},
	{
		id: 2,
		name: 'Bob Smith',
		email: 'bob@example.com',
		picture: getRandomRobot(2),
		bio: 'Designer and creative thinker',
		location: 'New York, NY',
		createdAt: '2023-02-20T14:15:00Z',
		isActive: true
	},
	{
		id: 3,
		name: 'Carol Davis',
		email: 'carol@example.com',
		picture: getRandomRobot(3),
		bio: 'Product manager with 5+ years experience',
		location: 'Austin, TX',
		createdAt: '2023-03-10T09:45:00Z',
		isActive: false
	}
]
export const ManageUsers: Component<{
	db: SqliteRemoteDatabase<typeof schema>
}> = props => {
	const [users, setUsers] = createSignal<User[]>([])
	const [loading, setLoading] = createSignal(false)
	const [error, setError] = createSignal<string | null>(null)
	const [success, setSuccess] = createSignal<string | null>(null)
	const [selectedUser, setSelectedUser] = createSignal<User | null>(null)
	const fetchUsers = async () => {
		try {
			let all = await props.db.select().from(schema.users).all()
			if (all.length === 0) {
				await props.db.insert(userSchema).values(mockUsers)
				all = await props.db.select().from(schema.users).all()
				return
			}
			setUsers(all as any)
		} catch (err: any) {
			console.error('fetchUsers failed', err)
			setError(err.message || 'Failed to load users')
		}
	}
	const [posts] = createResource(selectedUser, async user => {
		if (!user) return []
		try {
			return await props.db
				.select()
				.from(schema.posts)
				.where(eq(schema.posts.authorId, user.id))
				.all()
		} catch (err: any) {
			console.error('Failed to fetch posts for user', user.id, err)
			return []
		}
	})
	const addUser = async ({
		name,
		email,
		bio = 'No bio provided',
		location = 'Unknown Location'
	}: {
		name: string
		email: string
		bio?: string
		location?: string
	}) => {
		if (!name.trim() || !email.trim()) {
			setError('Both name and email are required.')
			return
		}

		setLoading(true)
		setError(null)
		setSuccess(null)
		try {
			await props.db.insert(schema.users).values({
				name: name.trim(),
				email: email.trim(),
				bio: bio.trim(),
				location: location.trim(),
				picture: getRandomRobot(users().length + 1),
				isActive: true,
				createdAt: new Date().toISOString()
			})

			setSuccess('User added successfully.')
			await fetchUsers()
		} catch (err: any) {
			console.error('addUser failed', err)
			setError(err.message || 'Unknown error')
		} finally {
			setLoading(false)
		}
	}

	const deleteUser = async (id: number) => {
		setLoading(true)
		setError(null)
		setSuccess(null)
		try {
			await props.db.delete(schema.users).where(eq(schema.users.id, id))
			setSuccess('User deleted.')
			await fetchUsers()
		} catch (err: any) {
			console.error('deleteUser failed', err)
			setError(err.message || 'Unknown error')
		} finally {
			setLoading(false)
		}
	}

	const updateName = async (id: number, newName: string) => {
		if (!newName.trim()) return
		setLoading(true)
		setError(null)
		setSuccess(null)
		try {
			await props.db
				.update(schema.users)
				.set({ name: newName.trim() })
				.where(eq(schema.users.id, id))
			setSuccess('Name updated.')
			await fetchUsers()
		} catch (err: any) {
			console.error('updateName failed', err)
			setError(err.message || 'Unknown error')
		} finally {
			setLoading(false)
		}
	}

	const updateEmail = async (id: number, newEmail: string) => {
		if (!newEmail.trim()) return
		setLoading(true)
		setError(null)
		setSuccess(null)
		try {
			await props.db
				.update(schema.users)
				.set({ email: newEmail.trim() })
				.where(eq(schema.users.id, id))
			setSuccess('Email updated.')
			await fetchUsers()
		} catch (err: any) {
			console.error('updateEmail failed', err)
			setError(err.message || 'Unknown error')
		} finally {
			setLoading(false)
		}
	}
	const onCreatePost = async (userId: number, content: string) => {
		if (!content.trim()) {
			setError('Post content cannot be empty.')
			return
		}
		setLoading(true)
		setError(null)
		setSuccess(null)
		try {
			await props.db.insert(schema.posts).values({
				authorId: userId,
				title: 'New Post',
				body: content.trim(),
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
			setSuccess('Post created successfully.')
			// Optionally, refresh user posts or related data
		} catch (err: any) {
			console.error('onCreatePost failed', err)
			setError(err.message || 'Failed to create post')
		}
	}
	const onDeletePost = async (postId: number) => {
		setLoading(true)
		setError(null)
		setSuccess(null)
		try {
			await props.db.delete(schema.posts).where(eq(schema.posts.id, postId))
			setSuccess('Post deleted successfully.')
			// Optionally, refresh user posts or related data
		} catch (err: any) {
			console.error('onDeletePost failed', err)
			setError(err.message || 'Failed to delete post')
		} finally {
			setLoading(false)
		}
	}
	const onRowClick = (user: User) => {
		console.log('Row clicked:', user)
		setSelectedUser(user)
	}
	onMount(fetchUsers)

	return (
		<div class="w-full  bg-white rounded-2xl shadow-lg p-6">
			<h2 class="text-2xl font-semibold mb-4">Add New User</h2>
			{error() && <p class="text-red-500 mb-2">Error: {error()}</p>}
			{success() && <p class="text-green-600 mb-2">{success()}</p>}

			{/* form */}
			{/* table */}
			<UsersTable
				users={users()}
				loading={loading()}
				onDelete={deleteUser}
				onUpdateName={updateName}
				onUpdateEmail={updateEmail}
				onRowClick={onRowClick}
			/>
			<AddUserForm addUser={addUser} loading={loading()} />
			<UserProfileModal
				isOpen={() => !!selectedUser()}
				loading={false}
				onClose={() => setSelectedUser(null)}
				onCreatePost={onCreatePost}
				onDeletePost={onDeletePost}
				onUpdatePost={() => {}}
				user={selectedUser() || null}
				onUpdateUser={() => {}}
				posts={posts() || []}
			/>
		</div>
	)
}
