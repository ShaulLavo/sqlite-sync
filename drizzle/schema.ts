import {
	sqliteTable,
	AnySQLiteColumn,
	foreignKey,
	integer,
	text,
	uniqueIndex,
	primaryKey
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const posts = sqliteTable('posts', {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	authorId: integer('author_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	title: text().notNull(),
	body: text().notNull(),
	createdAt: text('created_at')
		.default(sql`(CURRENT_TIMESTAMP)`)
		.notNull(),
	updatedAt: text('updated_at')
		.default(sql`(CURRENT_TIMESTAMP)`)
		.notNull()
})

export const users = sqliteTable(
	'users',
	{
		id: integer().primaryKey({ autoIncrement: true }).notNull(),
		name: text().notNull(),
		email: text().notNull(),
		picture: text(),
		bio: text(),
		location: text()
	},
	table => [uniqueIndex('users_email_unique').on(table.email)]
)

export const cells = sqliteTable(
	'cells',
	{
		x: integer().notNull(),
		y: integer().notNull(),
		alive: integer({ mode: 'boolean' }).default(false).notNull()
	},
	table => [primaryKey({ columns: [table.x, table.y], name: 'cells_x_y_pk' })]
)

export const changeLog = sqliteTable('change_log', {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	tblName: text('tbl_name').notNull(),
	opType: text('op_type').notNull(),
	pkJson: text('pk_json').notNull(),
	rowJson: text('row_json').notNull(),
	changedAt: text('changed_at')
		.default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
		.notNull()
})

export const migrations = sqliteTable('migrations', {
	name: text().primaryKey().notNull(),
	appliedAt: text('applied_at')
		.default(sql`(current_timestamp)`)
		.notNull()
})
