import { createSignal, type Component } from 'solid-js'
import Button from '../ui/Button'

export const AddUserForm: Component<{
	addUser: (args: {
		name: string
		email: string
		bio?: string
		location?: string
	}) => Promise<void>
	loading: boolean
}> = props => {
	const [name, setName] = createSignal('')
	const [email, setEmail] = createSignal('')
	const [bio, setBio] = createSignal('')
	const [location, setLocation] = createSignal('')

	const handleSubmit = (e: Event) => {
		e.preventDefault()

		const payload: {
			name: string
			email: string
			bio?: string
			location?: string
		} = {
			name: name().trim(),
			email: email().trim()
		}
		if (bio().trim()) {
			payload.bio = bio().trim()
		}
		if (location().trim()) {
			payload.location = location().trim()
		}

		props.addUser(payload)
		setName('')
		setEmail('')
		setBio('')
		setLocation('')
	}

	return (
		<form onSubmit={handleSubmit} class="space-y-4 mb-6">
			<div>
				<label
					for="name"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Name
				</label>
				<input
					id="name"
					type="text"
					value={name()}
					onInput={e => setName((e.currentTarget as HTMLInputElement).value)}
					class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-purple-500 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 transition-colors duration-200"
					disabled={props.loading}
				/>
			</div>
			<div>
				<label
					for="email"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Email
				</label>
				<input
					id="email"
					type="email"
					value={email()}
					onInput={e => setEmail((e.currentTarget as HTMLInputElement).value)}
					class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-purple-500 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 transition-colors duration-200"
					disabled={props.loading}
				/>
			</div>
			<div>
				<label
					for="bio"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Bio
				</label>
				<input
					id="bio"
					type="text"
					value={bio()}
					onInput={e => setBio((e.currentTarget as HTMLInputElement).value)}
					class="block min-w-0 grow py-1.5 pr-3 pl-1 text-base w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-purple-500 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 transition-colors duration-200"
					placeholder="Optional"
					disabled={props.loading}
				/>
			</div>
			<div>
				<label
					for="location"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Location
				</label>
				<input
					id="location"
					type="text"
					value={location()}
					onInput={e =>
						setLocation((e.currentTarget as HTMLInputElement).value)
					}
					class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-purple-500 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 transition-colors duration-200"
					placeholder="Optional"
					disabled={props.loading}
				/>
			</div>
			<Button type="submit" class="w-full" disabled={props.loading}>
				{props.loading ? 'Adding…' : 'Add User'}
			</Button>
		</form>
	)
}
