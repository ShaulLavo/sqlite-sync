import { desc } from 'drizzle-orm'
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import * as schema from '../sqlite/schema.ts'

export const getLatestId = async (db: SqliteRemoteDatabase<typeof schema>) => {
	const res = await db
		.select({ id: schema.changeLog.id })
		.from(schema.changeLog)
		.orderBy(desc(schema.changeLog.id))
		.limit(1)
	return res?.[0]?.id ?? 0
}
