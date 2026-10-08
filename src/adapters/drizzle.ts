import type { AsyncBatchRemoteCallback, AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy'
import type { ReactiveDatabase, SqlValue } from '../core/types'

function bindValue(value: unknown): SqlValue {
	if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || value instanceof Uint8Array) return value
	if (typeof value === 'boolean') return value ? 1 : 0
	if (value instanceof Date) return value.getTime()
	throw new TypeError('Unsupported Drizzle SQL parameter')
}

export function drizzleDriver(database: ReactiveDatabase) {
	const driver: AsyncRemoteCallback = async (sql, params, method) => {
		const result = await database.execute(sql, params.map(bindValue))
		// sqlite-proxy get() expects the first row, whereas all()/values() expect rows.
		return { rows: method === 'get' ? result.rows[0] ?? [] : result.rows }
	}
	const batchDriver: AsyncBatchRemoteCallback = async queries => {
		const results = await database.batch(queries.map(query => ({ sql: query.sql, params: query.params.map(bindValue) })))
		return results.map((result, i) => ({ rows: queries[i].method === 'get' ? result.rows[0] ?? [] : result.rows }))
	}
	return { driver, batchDriver }
}

export function liveDrizzleQuery(database: ReactiveDatabase, query: { toSQL(): { sql: string; params: unknown[] } }) {
	const statement = query.toSQL()
	return database.liveQuery(statement.sql, statement.params.map(bindValue))
}
