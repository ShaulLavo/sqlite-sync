import * as Comlink from 'comlink'
import { createEffect, onMount } from 'solid-js'
import { createStore, produce, reconcile } from 'solid-js/store'
import { seedDemoData } from '../consts/demoData'
import { useDb } from '../context/DbProvider'
import type { User } from '../sqlite/schema'
import * as schema from '../sqlite/schema'

export const useUsers = () => {
	const { db, api } = useDb()

	const [users, setUsers] = createStore<User[]>([])

	onMount(async () => {
		const database = await db
		const initialUsers = await database.select().from(schema.users).all()
		setUsers(initialUsers)
		api.subscribeToAllChangesInTable(
			'users',
			Comlink.proxy(change => {
				if (change.op_type === 'INSERT') {
					const newUser = JSON.parse(change.row_json)
					setUsers(
						produce(users => {
							users.push(newUser)
							return users
						})
					)
				}
				if (change.op_type === 'DELETE') {
					const { id } = JSON.parse(change.pk_json)
					setUsers(reconcile(users.filter(u => u.id !== id)))
				}
				if (change.op_type === 'UPDATE') {
					const updatedUser = JSON.parse(change.row_json)
					setUsers(
						produce(users => {
							const idx = users.findIndex(u => u.id === updatedUser.id)
							if (idx !== -1) {
								users[idx] = updatedUser
							}
							return users
						})
					)
				}
			})
		)
		createEffect(async () => {
			if (users.length === 0) {
				await seedDemoData(database)
				const initialUsers = await database.select().from(schema.users).all()

				setUsers(initialUsers)
			}
		})
	})

	return users
}
