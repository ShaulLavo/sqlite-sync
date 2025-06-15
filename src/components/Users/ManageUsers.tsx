import { eq } from 'drizzle-orm'
import { createSignal, type Component } from 'solid-js'
import { getRandomRobot } from '../../consts/demoData'
import { useDb } from '../../context/DbProvider'
import * as schema from '../../sqlite/schema'
import { useUsers } from '../../hooks/useLiveUsers'
import { AddUserForm } from './AddUser'
import { UsersTable } from './UserTable'

export const ManageUsers: Component = () => {
	const { db } = useDb()

	const [loading, setLoading] = createSignal(false)
	const [error, setError] = createSignal<string | null>(null)
	const [success, setSuccess] = createSignal<string | null>(null)

	const users = useUsers()
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
			const database = await db
			await database.insert(schema.users).values({
				name: name.trim(),
				email: email.trim(),
				bio: bio.trim(),
				location: location.trim(),
				picture: getRandomRobot(users.length + 1),
				is_active: true,
				created_at: new Date().toISOString()
			})

			setSuccess('User added successfully.')
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
			await (await db).delete(schema.users).where(eq(schema.users.id, id))
			setSuccess('User deleted.')
		} catch (err: any) {
			console.error('deleteUser failed', err)
			setError(err.message || 'Unknown error')
		} finally {
			setLoading(false)
		}
	}

	return (
		<div class="w-full bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 transition-colors duration-300">
			<div class="flex flex-col md:flex-row gap-8">
				<div class="flex-grow md:w-2/3">
					<UsersTable
						users={users}
						loading={loading()}
						onDelete={deleteUser}
						setError={setError}
						setSuccess={setSuccess}
						setLoading={setLoading}
						error={error()}
						success={success()}
					/>
				</div>

				<div class="flex flex-col md:w-1/3">
					<h2 class="text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
						Add New User
					</h2>

					<AddUserForm addUser={addUser} loading={loading()} />
				</div>
			</div>
		</div>
	)
}
