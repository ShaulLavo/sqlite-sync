import * as Comlink from 'comlink'
import { createEffect, on, onMount } from 'solid-js'
import { createStore, produce, reconcile } from 'solid-js/store'
import { seedDemoData } from '../consts/demoData'
import { useDb } from '../context/DbProvider'
import type { User } from '../sqlite/schema'
import * as schema from '../sqlite/schema'
import { trackDeep } from '@solid-primitives/deep'

export const useUsers = () => {
	const { db, api } = useDb()

	const [users, setUsers] = createStore<User[]>([])

	onMount(async () => {
		const database = await db
		const initialUsers = await database.select().from(schema.users).all()
		setUsers(initialUsers)
		api.subscribeToTable(
			'users',
			Comlink.proxy(changes => {
				for (const change of changes) {
					if (change.op_type === 'INSERT') {
						const newUser = JSON.parse(change.row_json)
						setUsers(
							produce(users => {
								users.push(newUser)
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
							})
						)
					}
				}
			})
		)
	})

	let isFirstRender = true
	createEffect(async () => {
		if (isFirstRender) return (isFirstRender = false)
		if (users.length === 0) {
			const database = await db
			await seedDemoData(database)
			const initialUsers = await database.select().from(schema.users).all()

			setUsers(initialUsers)
		}
	})

	return users
}
