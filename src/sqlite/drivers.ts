// drivers.ts
import type { Client, InArgs } from './client-wasm'
import type { DriverQuery, DriverQueryResult, Sqlite3Method } from './types'

function extractRows(
	objectRows: Record<string, any>[] = [],
	method: Sqlite3Method
): unknown[][] {
	if (!objectRows.length) return []

	if (method === 'all') {
		const cols = Object.keys(objectRows[0])
		return objectRows.map(r => cols.map(c => r[c]))
	}

	if (method === 'get') {
		return [Object.values(objectRows[0])]
	}

	if (method === 'values') {
		return objectRows.map(r => Object.values(r))
	}

	return []
}

export async function driver(
	client: Client,
	sql: string,
	params: InArgs = [],
	method: Sqlite3Method = 'all'
): Promise<DriverQueryResult> {
	const { rows: objectRows = [] } = await client.execute(sql, params)
	return { rows: extractRows(objectRows, method) }
}

export async function batchDriver(
	client: Client,
	queries: DriverQuery[]
): Promise<DriverQueryResult[]> {
	const stmts = queries.map(({ sql, params = [] }) => ({
		sql,
		args: params
	}))
	console.log('batching', queries)
	const batchResults = await client.batch(stmts, 'deferred')
	return batchResults.map((res, i) => {
		const method = queries[i].method || 'all'
		const objectRows = (res.rows || []) as Record<string, any>[]
		return { rows: extractRows(objectRows, method) }
	})
}
