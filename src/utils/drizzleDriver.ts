import type { Api } from '../sqlite'
import type { Sqlite3Method } from '../sqlite/types'
import type { InArgs } from '../sqlite/client-wasm'

const serializeParams = (params: InArgs): string => {
	if (Array.isArray(params)) {
		return params.map(x => (x === null ? '∅' : String(x))).join('\u0000')
	}

	const asObj = params as Record<string, string | number | boolean | null>
	const keys = Object.keys(asObj).sort()
	let out = ''
	for (const k of keys) {
		const v = asObj[k]
		out += k + '\u0000' + (v === null ? '∅' : String(v)) + '\u0000'
	}
	return out
}

const makeKey = (
	sql: string,
	params: InArgs,
	method: Sqlite3Method
): string => {
	const flatParams = serializeParams(params)
	return sql + '\u0000' + flatParams + '\u0000' + method
}

const makeBatchKey = (
	queries: { sql: string; params: InArgs; method: Sqlite3Method }[]
): string => {
	return queries
		.map(({ sql, params, method }) => {
			const flat = serializeParams(params)
			return sql + '\u0000' + flat + '\u0000' + method
		})
		.join('\u0002')
}

export const getDrizzleDriver = (api: Api) => {
	type DriverResult = {
		rows: any[][]
	}
	return {
		async driver(
			sql: string,
			params: InArgs,
			method: Sqlite3Method
		): Promise<DriverResult> {
			const result = await api.driver(sql, params)

			return result
		},

		async batchDriver(
			queries: { sql: string; params: InArgs; method: Sqlite3Method }[]
		): Promise<DriverResult[]> {
			const results = await api.batchDriver(queries)

			return results
		}
	}
}
