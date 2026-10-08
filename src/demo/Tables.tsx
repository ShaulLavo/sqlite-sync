import { createSignal, For, Show } from 'solid-js'
import { createLiveQuery } from '../adapters/solid'
import type { ReactiveDatabase } from '../core/types'
import { numeric, textValue } from './database'
import { SqlWorkspace } from './SqlWorkspace'

export function Tables(props: { db: ReactiveDatabase; onError: (error: unknown) => void }) {
	const [table, setTable] = createSignal('users')
	const [name, setName] = createSignal('')
	const [email, setEmail] = createSignal('')
	const [busy, setBusy] = createSignal(false)
	const users = createLiveQuery(props.db.liveTable('users'), {
		map: row => ({ id: numeric(row, 'id'), name: textValue(row, 'name'), email: textValue(row, 'email'), active: row.is_active === 1 })
	})

	async function addUser(event: SubmitEvent) {
		event.preventDefault()
		setBusy(true)
		try { await props.db.execute('INSERT INTO users(name,email) VALUES (?,?)', [name().trim(), email().trim()]); setName(''); setEmail('') }
		catch (error) { props.onError(error) }
		finally { setBusy(false) }
	}

	async function mutate(sql: string, id: number) {
		try { await props.db.execute(sql, [id]) }
		catch (error) { props.onError(error) }
	}

	async function renameUser(id: number, value: string) {
		if (!value.trim()) return
		try { await props.db.execute('UPDATE users SET name = ? WHERE id = ?', [value.trim(), id]) }
		catch (error) { props.onError(error) }
	}

	return <section class="tables-section" aria-label="Database table explorer">
		<div class="section-heading"><div><p class="eyebrow">03 / The data underneath</p><h2>Table explorer</h2></div><span class="storage-badge">Local database · persisted in OPFS</span></div>
		<div class="table-picker"><For each={['users', 'cells', 'posts', 'demo_meta']}>{name => <button classList={{ selected: table() === name }} onClick={() => setTable(name)}><span class="table-icon">▦</span>{name}</button>}</For></div>
		<Show when={table() === 'users'} fallback={<Show keyed when={table()}>{name => <SqlWorkspace db={props.db} initialTable={name} onError={props.onError} />}</Show>}>
			<form class="user-form" onSubmit={event => void addUser(event)}><div><label for="new-name">Name</label><input id="new-name" value={name()} onInput={event => setName(event.currentTarget.value)} placeholder="Grace Hopper" required maxlength="160" /></div><div><label for="new-email">Email</label><input id="new-email" type="email" value={email()} onInput={event => setEmail(event.currentTarget.value)} placeholder="grace@example.test" required maxlength="254" /></div><button class="button primary" disabled={busy()} type="submit">+ Insert user</button></form>
			<div class="result-scroll"><table class="data-table users-table"><thead><tr><th>ID</th><th>Name · edit on blur</th><th>Email</th><th>Status</th><th>Mutation</th></tr></thead><tbody><For each={users.rows}>{user => <tr><td class="muted">{user.id}</td><td><input aria-label={`Name for user ${user.id}`} value={user.name} onBlur={event => { if (event.currentTarget.value !== user.name) void renameUser(user.id, event.currentTarget.value) }} /></td><td>{user.email}</td><td><button class="user-status" classList={{ inactive: !user.active }} onClick={() => void mutate('UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?', user.id)}>{user.active ? 'Active' : 'Inactive'}</button></td><td><button class="delete-button" aria-label={`Delete ${user.name}`} onClick={() => void mutate('DELETE FROM users WHERE id = ?', user.id)}>Delete</button></td></tr>}</For></tbody></table><Show when={!users.rows.length}><p class="empty-state">No users yet. Insert a row above.</p></Show></div>
			<p class="caption">Every edit is a parameterized SQLite statement. The table updates from its live subscription after commit.</p>
			<Show when={users.error()}><p class="inline-error" role="alert">{users.error()?.message}</p></Show>
		</Show>
	</section>
}
