import type { Api } from '../sqliteWorker'

type Sqlite3Method = 'get' | 'all' | 'run' | 'values'

export const getDrizzleDriver = async (api: Api) => {
	return {
		driver: async (sql: string, params: unknown[], method: Sqlite3Method) => {
			console.log(
				'Drizzle driver called with SQL:',
				JSON.stringify({ method }, null, 2)
			)
			const { rows: objectRows } = await api.run(sql, params)
			if (!objectRows || objectRows.length === 0) {
				return { rows: [] }
			}

			const columns = Object.keys(objectRows[0])

			const values = objectRows.map((rowObj: Record<string, any>) =>
				columns.map(colName => rowObj[colName])
			)

			return { rows: values }
		},

		batchDriver: async (
			queries: { sql: string; params: unknown[]; method: Sqlite3Method }[]
		) => {
			const rawResults = await api.batchRun(queries)

			return rawResults.map(({ rows: objectRows }) => {
				if (!objectRows || objectRows.length === 0) {
					return { rows: [] }
				}
				const columns = Object.keys(objectRows[0])
				const values = objectRows.map((rowObj: Record<string, any>) =>
					columns.map(colName => rowObj[colName])
				)
				return { rows: values }
			})
		}
	}
}
