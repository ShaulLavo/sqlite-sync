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
			await (await db).insert(schema.users).values({
				name: name.trim(),
				email: email.trim(),
				bio: bio.trim(),
				location: location.trim(),
				picture: getRandomRobot(users.length + 1),
				isActive: true,
				createdAt: new Date().toISOString()
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
		<div class="w-full bg-white rounded-2xl shadow-lg p-6">
			<div class="flex flex-row">
				<div class="flex-2/3">
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

				<div class="flex flex-col flex-1/3  ml-8 justify-center">
					<h2 class="text-2xl font-semibold mb-4">Add New User</h2>

					<AddUserForm addUser={addUser} loading={loading()} />
				</div>
			</div>
		</div>
	)
}
