import init, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import { ReactiveEngine } from './engine'
import { assertSingleStatement } from './sql'
import { quote } from './changes'
import type { DatabaseOptions } from './types'

export async function createEngine(options: DatabaseOptions): Promise<ReactiveEngine> {
	const sqlite = await init()
	let db: Database | undefined
	try {
		db = await openStorage(sqlite, options)
		applyMigrations(sqlite, db, options)
		return new ReactiveEngine(sqlite, db, options.durableLog ?? false)
	} catch (error) {
		db?.close()
		throw error
	}
}

async function openStorage(sqlite: Sqlite3Static, options: DatabaseOptions): Promise<Database> {
	if (options.storage === 'memory') return new sqlite.oo1.DB()
	if (!navigator.storage?.getDirectory) throw new Error('OPFS storage is unavailable. Use HTTPS and a browser with OPFS support, or explicitly choose memory storage.')
	const name = options.name ?? 'local.db'
	// Keep the original demo directory and filename so existing databases survive the upgrade.
	const vfsName = name === 'local.db' ? 'file:local.db' : `sqlite-sync-${encodeURIComponent(name)}`
	const pool = await sqlite.installOpfsSAHPoolVfs({ name: vfsName, initialCapacity: 4 })
	return new pool.OpfsSAHPoolDb(`/${name}`)
}

function applyMigrations(sqlite: Sqlite3Static, db: Database, options: DatabaseOptions) {
	db.exec('PRAGMA foreign_keys=ON')
	db.exec('CREATE TABLE IF NOT EXISTS _sqlite_sync_migrations(id TEXT PRIMARY KEY NOT NULL)')
	const journal = options.legacyJournal
	const hasLegacyJournal = journal && db.selectValue("SELECT 1 FROM sqlite_schema WHERE name=? AND type='table'", [journal.table])
	const legacyIds = journal && hasLegacyJournal ? new Set(db.selectValues(`SELECT ${quote(journal.column)} FROM ${quote(journal.table)}`).map(String)) : new Set<string>()
	for (const migration of options.migrations ?? []) {
		if (db.selectValue('SELECT 1 FROM _sqlite_sync_migrations WHERE id=?', [migration.id])) continue
		applyMigration(sqlite, db, migration, legacyIds.has(migration.id))
	}
}

function applyMigration(sqlite: Sqlite3Static, db: Database, migration: NonNullable<DatabaseOptions['migrations']>[number], alreadyApplied: boolean) {
	// Schema rebuild migrations need foreign keys disabled before BEGIN, never inside it.
	db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE')
	let committed = false
	try {
		sqlite.capi.sqlite3_set_authorizer(db, (_, action) => action === sqlite.capi.SQLITE_TRANSACTION || action === sqlite.capi.SQLITE_SAVEPOINT || action === sqlite.capi.SQLITE_ATTACH || action === sqlite.capi.SQLITE_DETACH ? sqlite.capi.SQLITE_DENY : sqlite.capi.SQLITE_OK, 0)
		if (!alreadyApplied) for (const sql of migration.sql) {
			assertSingleStatement(sql, sqlite.capi.sqlite3_complete)
			db.exec(sql)
		}
		Reflect.apply(sqlite.capi.sqlite3_set_authorizer, sqlite.capi, [db, 0, 0])
		const violations = db.selectObjects('PRAGMA foreign_key_check')
		if (violations.length) throw new Error(`Migration ${migration.id} violates foreign keys`)
		db.exec({ sql: `INSERT INTO ${quote('_sqlite_sync_migrations')}(id) VALUES(?)`, bind: [migration.id] })
		db.exec('COMMIT')
		committed = true
	} finally {
		Reflect.apply(sqlite.capi.sqlite3_set_authorizer, sqlite.capi, [db, 0, 0])
		const autocommit: unknown = Reflect.get(sqlite.capi, 'sqlite3_get_autocommit')
		if (!committed && typeof autocommit === 'function' && !autocommit(db.pointer)) db.exec('ROLLBACK')
		db.exec('PRAGMA foreign_keys=ON')
	}
}
