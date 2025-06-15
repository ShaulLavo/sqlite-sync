import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { getLatestId } from './cursor'
import * as schema from '../sqlite/schema'

export async function setupWebsocket(db: SqliteRemoteDatabase<typeof schema>) {
	const ws = new WebSocket('ws://localhost:3000/ws')

	ws.addEventListener('open', async () => {
		ws.send(JSON.stringify({ type: 'ping', cursor: await getLatestId(db) }))
	})

	ws.addEventListener('message', async ({ data }) => {
		const { type, cursor } = JSON.parse(data)

		if (type === 'pong') {
			console.log('Server at', cursor, "I'm at", await getLatestId(db))
		}

		if (type === 'request_data') {
			ws.send(
				JSON.stringify({
					type: 'data',
					cursor: await getLatestId(db),
					payload: {}
				})
			)
		}
	})
}
