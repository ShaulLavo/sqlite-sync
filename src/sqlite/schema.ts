import { relations, sql } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
	id: integer('id', { mode: 'number' })
		.primaryKey({ autoIncrement: true })
		.notNull(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	picture: text('picture'),
	bio: text('bio'),
	location: text('location'),
	created_at: text('created_at')
		.notNull()
		.default(sql`(CURRENT_TIMESTAMP)`),
	is_active: integer('is_active', { mode: 'boolean' }).default(true)
})
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export const posts = sqliteTable('posts', {
	id: integer('id', { mode: 'number' })
		.primaryKey({ autoIncrement: true })
		.notNull(),
	author_id: integer('author_id', { mode: 'number' })
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	body: text('body').notNull(),
	created_at: text('created_at')
		.notNull()
		.default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text('updated_at')
		.notNull()
		.default(sql`(CURRENT_TIMESTAMP)`)
})
export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert

export const usersRelations = relations(users, ({ many }) => ({
	posts: many(posts)
}))

export const postsRelations = relations(posts, ({ one }) => ({
	author: one(users, {
		fields: [posts.author_id],
		references: [users.id]
	})
}))

export const cells = sqliteTable(
	'cells',
	{
		x: integer('x', { mode: 'number' }).notNull(),
		y: integer('y', { mode: 'number' }).notNull(),
		alive: integer('alive', { mode: 'boolean' }).default(false).notNull()
	},
	table => [primaryKey({ columns: [table.x, table.y] })]
)
export type Cells = typeof cells.$inferSelect
export type NewCells = typeof cells.$inferInsert

/*
	SYSTEM TABLES
*/

export const migrations = sqliteTable('migrations', {
	name: text('name').notNull().primaryKey(),
	applied_at: text('applied_at')
		.notNull()
		.default(sql`(current_timestamp)`)
})
export type Migration = typeof migrations.$inferSelect
export type NewMigration = typeof migrations.$inferInsert

export const OPERATIONS = ['INSERT', 'DELETE', 'UPDATE'] as const
export type Operation = (typeof OPERATIONS)[number]

export const changeLog = sqliteTable('change_log', {
	id: integer('id', { mode: 'number' })
		.primaryKey({ autoIncrement: true })
		.notNull(),
	tbl_name: text('tbl_name').notNull(),
	op_type: text('op_type', { enum: OPERATIONS }).notNull(),
	pk_json: text('pk_json').notNull(),
	row_json: text('row_json').notNull(),
	changed_at: text('changed_at')
		.notNull()
		.default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
})
export type ChangeLog = typeof changeLog.$inferSelect
export type NewChangeLog = typeof changeLog.$inferInsert
