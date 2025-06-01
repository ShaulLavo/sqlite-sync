import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const migrations = sqliteTable('migrations', {
	name: text('name').notNull().primaryKey(),
	applied_at: text('applied_at')
		.notNull()
		.default(sql`(current_timestamp)`)
})
//  name TEXT PRIMARY KEY,
//         applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
export const users = sqliteTable('users', {
	id: integer('id', { mode: 'number' })
		.primaryKey({ autoIncrement: true })
		.notNull(),
	name: text('name').notNull().unique(),
	email: text('email').notNull().unique()
})

export const posts = sqliteTable('posts', {
	id: integer('id', { mode: 'number' })
		.primaryKey({ autoIncrement: true })
		.notNull(),
	authorId: integer('author_id', { mode: 'number' })
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	body: text('body').notNull()
})

export type Migration = typeof migrations.$inferSelect
export type NewMigration = typeof migrations.$inferInsert

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
