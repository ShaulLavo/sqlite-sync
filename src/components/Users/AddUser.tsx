import { createSignal, type Component } from 'solid-js'

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
				<label for="name" class="block text-sm font-medium text-gray-700">
					Name
				</label>
				<input
					id="name"
					type="text"
					value={name()}
					onInput={e => setName((e.currentTarget as HTMLInputElement).value)}
					class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					disabled={props.loading}
				/>
			</div>
			<div>
				<label for="email" class="block text-sm font-medium text-gray-700">
					Email
				</label>
				<input
					id="email"
					type="email"
					value={email()}
					onInput={e => setEmail((e.currentTarget as HTMLInputElement).value)}
					class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					disabled={props.loading}
				/>
			</div>
			<div>
				<label for="bio" class="block text-sm font-medium text-gray-700">
					Bio
				</label>
				<input
					id="bio"
					type="text"
					value={bio()}
					onInput={e => setBio((e.currentTarget as HTMLInputElement).value)}
					class="block min-w-0 grow py-1.5 pr-3 pl-1 text-base w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					placeholder="Optional"
					disabled={props.loading}
				/>
			</div>
			<div>
				<label for="location" class="block text-sm font-medium text-gray-700">
					Location
				</label>
				<input
					id="location"
					type="text"
					value={location()}
					onInput={e =>
						setLocation((e.currentTarget as HTMLInputElement).value)
					}
					class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
					placeholder="Optional"
					disabled={props.loading}
				/>
			</div>
			<button
				type="submit"
				class="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
				disabled={props.loading}
			>
				{props.loading ? 'Adding…' : 'Add User'}
			</button>
		</form>
	)
}
