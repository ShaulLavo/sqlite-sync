import type { Database } from '@sqlite.org/sqlite-wasm'
import type { Change, Row, SqlValue } from './types'

export const quote = (name: string) => `"${name.replaceAll('"', '""')}"`
const literal = (text: string) => `'${text.replaceAll("'", "''")}'`
export const queueName = '_sqlite_sync_changes'
export type TableInfo = { name: string; columns: string[]; keys: string[]; stableKey: boolean; identity: string[] }

function encodedValue(value: string) {
	return `CASE WHEN typeof(${value})='blob' THEN json_object('$sqliteBlob',hex(${value})) WHEN typeof(${value})='real' THEN json_object('$sqliteReal',printf('%!.26g',${value})) WHEN typeof(${value})='integer' AND (${value}>9007199254740991 OR ${value}<-9007199254740991) THEN json_object('$sqliteInteger',CAST(${value} AS TEXT)) ELSE ${value} END`
}

function jsonRow(columns: string[], ref: 'OLD' | 'NEW') {
	return `json_object(${columns.flatMap(column => [literal(column), encodedValue(`${ref}.${quote(column)}`)]).join(',')})`
}

export function discoverTables(db: Database, durable = false): TableInfo[] {
	const names = db.selectValues(`SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_sqlite_sync_*' ${durable ? "AND name <> 'change_log'" : ''} AND sql NOT LIKE 'CREATE VIRTUAL TABLE%' ORDER BY name`)
	return names.map(value => {
		const name = String(value)
		const columns = db.selectObjects(`PRAGMA table_xinfo(${quote(name)})`)
		const keys = columns.filter(column => Number(column.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map(column => String(column.name))
		const primary = columns.filter(column => Number(column.pk) > 0)
		const integerAlias = primary.length === 1 && String(primary[0].type).toUpperCase() === 'INTEGER' && !db.selectObjects(`PRAGMA index_list(${quote(name)})`).some(index => index.origin === 'pk')
		const stableKey = primary.length > 0 && (integerAlias || primary.every(column => Number(column.notnull) > 0))
		const alias = ['rowid', '_rowid_', 'oid'].find(alias => !columns.some(column => String(column.name).toLowerCase() === alias))
		const identity = stableKey ? keys : alias ? [alias] : []
		return { name, identity, columns: columns.filter(column => Number(column.hidden) !== 1).map(column => String(column.name)), keys, stableKey }
	})
}

export function installChangeTracking(db: Database, durable: boolean): Map<string, TableInfo> {
	db.exec(`CREATE TEMP TABLE IF NOT EXISTS ${quote(queueName)}(sequence INTEGER PRIMARY KEY, tbl TEXT NOT NULL, op TEXT NOT NULL, pk TEXT NOT NULL, old_pk TEXT NOT NULL, row TEXT NOT NULL)`)
	if (durable) db.exec("CREATE TABLE IF NOT EXISTS change_log(id INTEGER PRIMARY KEY AUTOINCREMENT, tbl_name TEXT NOT NULL, op_type TEXT NOT NULL, pk_json TEXT NOT NULL, row_json TEXT NOT NULL, changed_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')))")
	removeChangeTracking(db)
	const tables = discoverTables(db, durable)
	for (const table of tables) installTableTriggers(db, table, durable)
	return new Map(tables.map(table => [table.name, table]))
}

function installTableTriggers(db: Database, table: TableInfo, durable: boolean) {
	for (const operation of ['INSERT', 'UPDATE', 'DELETE'] as const) {
		installTrigger(db, table, operation, durable)
	}
}

function installTrigger(db: Database, table: TableInfo, operation: Change['operation'], durable: boolean) {
	const { name, columns, identity } = table
	const ref = operation === 'DELETE' ? 'OLD' : 'NEW'
	const pkColumns = identity
	const condition = operation === 'UPDATE' ? `WHEN ${columns.map(column => `(OLD.${quote(column)} COLLATE BINARY IS NOT NEW.${quote(column)} COLLATE BINARY OR typeof(OLD.${quote(column)}) IS NOT typeof(NEW.${quote(column)}))`).join(' OR ')}` : ''
	const values = `${literal(name)},${literal(operation)},${jsonRow(pkColumns, ref)},${jsonRow(pkColumns, operation === 'INSERT' ? 'NEW' : 'OLD')},${jsonRow(columns, ref)}`
	const trigger = `_sqlite_sync_${name}_${operation.toLowerCase()}`
	db.exec(`DROP TRIGGER IF EXISTS temp.${quote(trigger)}`)
	db.exec(`CREATE TEMP TRIGGER ${quote(trigger)} AFTER ${operation} ON main.${quote(name)} ${condition} BEGIN INSERT INTO ${quote(queueName)}(tbl,op,pk,old_pk,row) VALUES(${values}); END`)
	const logTrigger = `${trigger}_durable`
	db.exec(`DROP TRIGGER IF EXISTS main.${quote(logTrigger)}`)
	if (!durable) return
	db.exec(`CREATE TRIGGER ${quote(logTrigger)} AFTER ${operation} ON ${quote(name)} ${condition} BEGIN INSERT INTO change_log(tbl_name,op_type,pk_json,row_json) VALUES(${literal(name)},${literal(operation)},${jsonRow(pkColumns, ref)},${jsonRow(columns, ref)}); END`)
}

function decodeValue(value: unknown): SqlValue {
	if (value === null || typeof value === 'number' || typeof value === 'string') return value
	if (typeof value !== 'object') throw new Error('Invalid SQLite change value')
	if ('$sqliteReal' in value && typeof value.$sqliteReal === 'string') {
		if (value.$sqliteReal === 'Inf') return Infinity
		if (value.$sqliteReal === '-Inf') return -Infinity
		const number = Number(value.$sqliteReal)
		if (!Number.isNaN(number)) return number
		throw new Error('Invalid SQLite real value')
	}
	if ('$sqliteInteger' in value && typeof value.$sqliteInteger === 'string') return BigInt(value.$sqliteInteger)
	if ('$sqliteBlob' in value && typeof value.$sqliteBlob === 'string') {
		const hex = value.$sqliteBlob
		return Uint8Array.from({ length: hex.length / 2 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16))
	}
	throw new Error('Invalid SQLite change encoding')
}

function decodeRow(json: string): Row {
	const value: unknown = JSON.parse(json)
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid SQLite change row')
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeValue(item)]))
}

export function drainChanges(db: Database): Change[] {
	const rows = db.selectObjects(`SELECT * FROM temp.${quote(queueName)} ORDER BY sequence ASC`)
	const changes = rows.map((row): Change => {
		const operation = row.op
		if (operation !== 'INSERT' && operation !== 'UPDATE' && operation !== 'DELETE') throw new Error('Invalid SQLite operation')
		return { sequence: Number(row.sequence), table: String(row.tbl), operation, key: decodeRow(String(row.pk)), oldKey: decodeRow(String(row.old_pk)), row: decodeRow(String(row.row)) }
	})
	if (rows.length) db.exec(`DELETE FROM temp.${quote(queueName)}`)
	return changes
}

export function rowKey(row: Row): string {
	return JSON.stringify(Object.keys(row).sort().map(key => [key, typeof row[key] === 'bigint' ? { bigint: String(row[key]) } : typeof row[key] === 'number' && !Number.isFinite(row[key]) ? { number: String(row[key]) } : row[key]]))
}

export function removeChangeTracking(db: Database) {
	for (const schema of ['temp', 'main']) {
		const triggers = db.selectValues(`SELECT name FROM ${schema}.sqlite_schema WHERE type='trigger' AND name GLOB '_sqlite_sync_*'`)
		for (const trigger of triggers) db.exec(`DROP TRIGGER ${schema}.${quote(String(trigger))}`)
	}
}
