import type { Api } from '../sqlite'
import type { InArgs } from '../sqlite/client-wasm'

export const getDrizzleDriver = (api: Api) => {
	type DriverResult = {
		rows: any[][]
	}
	return {
		async driver(sql: string, params: InArgs): Promise<DriverResult> {
			const result = await api.driver(sql, params)

			return result
		},

		async batchDriver(
			queries: { sql: string; params: InArgs }[]
		): Promise<DriverResult[]> {
			const results = await api.batchDriver(queries)

			return results
		}
	}
}
