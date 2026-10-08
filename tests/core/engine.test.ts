import init from '@sqlite.org/sqlite-wasm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ReactiveEngine } from '../../src/core/engine'
import type { DatabaseEvent, WireUpdate } from '../../src/core/types'

let sqlite: Awaited<ReturnType<typeof init>>
let engine: ReactiveEngine
let events: DatabaseEvent[]
beforeAll(async () => { sqlite = await init() })
beforeEach(() => {
	const db = new sqlite.oo1.DB()
	db.exec('CREATE TABLE items(id INTEGER PRIMARY KEY, value TEXT, stamp INTEGER DEFAULT 0); CREATE TABLE other(id INTEGER PRIMARY KEY)')
	engine = new ReactiveEngine(sqlite, db)
	events = []
	engine.observe('test', event => { events.push(event) })
})
afterEach(() => engine.close())
const run = (sql: string) => engine.execute({ sql })
const operations = () => events.flatMap(event => event.kind === 'commit' ? event.changes.map(change => change.operation) : [])

describe('real SQLite committed observation', () => {
	it('delivers insert/update/delete in statement order, once per commit', () => {
		engine.batch([{ sql: "INSERT INTO items VALUES(1,'a',0)" }, { sql: "UPDATE items SET value='b'" }, { sql: 'DELETE FROM items' }])
		expect(operations()).toEqual(['INSERT','UPDATE','DELETE'])
		expect(events).toHaveLength(1)
		run('SELECT * FROM items')
		expect(events).toHaveLength(1)
		expect(engine.inspect().queueRows).toBe(0)
	})
	it('drops a failed batch and exposes no uncommitted query state', () => {
		expect(() => engine.batch([{ sql: 'INSERT INTO items(id) VALUES(1)' }, { sql: 'INSERT INTO items(id) VALUES(1)' }])).toThrow()
		expect(run('SELECT * FROM items').rows).toEqual([])
		expect(events).toEqual([])
	})
	it('honors nested savepoint rollback', () => {
		engine.batch([{ sql: "INSERT INTO items VALUES(1,'a',0)" }, { sql: 'SAVEPOINT a' }, { sql: "UPDATE items SET value='b'" }, { sql: 'SAVEPOINT b' }, { sql: 'DELETE FROM items' }, { sql: 'ROLLBACK TO a' }, { sql: 'RELEASE a' }])
		expect(operations()).toEqual(['INSERT'])
		expect(run('SELECT value FROM items').rows).toEqual([['a']])
	})
	it('suppresses no-op events without cancelling SQL writes, including nulls and timestamps', () => {
		run('INSERT INTO items(id) VALUES(1)')
		events.length = 0
		expect(run('UPDATE items SET value=NULL').rowsAffected).toBe(1)
		expect(events).toEqual([])
		run('UPDATE items SET stamp=1')
		expect(operations()).toEqual(['UPDATE'])
		run("UPDATE items SET value='a'")
		run('UPDATE items SET value=NULL')
		expect(operations()).toEqual(['UPDATE','UPDATE','UPDATE'])
	})
	it('snapshots and subscriptions share a synchronous registration boundary', () => {
		const updates: WireUpdate[] = []
		engine.watch('query', { table: 'items' }, update => { updates.push(update) })
		run('INSERT INTO items(id) VALUES(1)')
		expect(updates.map(update => update.kind)).toEqual(['snapshot','patch'])
		expect(updates[0]).toMatchObject({ rows: [], revision: 0 })
		expect(updates[1]).toMatchObject({ revision: 1 })
		engine.unwatch('query')
		run('DELETE FROM items')
		expect(updates).toHaveLength(2)
		expect(engine.inspect().subscribers).toBe(0)
	})
	it('selectively reruns shared queries with joins, filters, order and limits', () => {
		const updates: WireUpdate[] = []
		const query = { sql: 'SELECT i.id FROM items i LEFT JOIN other o ON i.id=o.id WHERE i.value IS NULL ORDER BY i.id DESC LIMIT 1' }
		engine.watch('a', query, update => { updates.push(update) })
		engine.watch('b', query, () => {})
		expect(engine.inspect().queryRuns).toBe(1)
		run('INSERT INTO items(id) VALUES(1),(2)')
		expect(updates.at(-1)).toMatchObject({ rows: [[2]], revision: 1 })
		expect(engine.inspect().queryRuns).toBe(2)
		run('INSERT INTO other VALUES(1)')
		expect(engine.inspect().queryRuns).toBe(3)
	})
	it('handles WITHOUT ROWID composite keys, BLOBs and int64 values', () => {
		run('CREATE TABLE composite(x INTEGER, y INTEGER, data BLOB, large INTEGER, PRIMARY KEY(x,y)) WITHOUT ROWID')
		events.length = 0
		engine.execute({ sql: 'INSERT INTO composite VALUES(1,2,?,?)', params: [new Uint8Array([0,255]), 9223372036854775807n] })
		const event = events[0]
		expect(event.kind).toBe('commit')
		if (event.kind !== 'commit') return
		expect(event.changes[0].key).toEqual({ x: 1, y: 2 })
		expect(event.changes[0].row).toEqual({ x:1,y:2,data:new Uint8Array([0,255]),large:9223372036854775807n })
	})
	it('captures primary key changes and foreign-key cascades', () => {
		run('CREATE TABLE child(id INTEGER PRIMARY KEY, item INTEGER REFERENCES items(id) ON DELETE CASCADE ON UPDATE CASCADE)')
		run('INSERT INTO items(id) VALUES(1)')
		run('INSERT INTO child VALUES(1,1)')
		events.length = 0
		run('UPDATE items SET id=2')
		const event = events[0]
		if (event.kind !== 'commit') throw new Error('missing commit')
		expect(event.changes.find(change => change.table === 'items')).toMatchObject({ key: {id:2}, oldKey:{id:1} })
		run('DELETE FROM items')
		expect(run('SELECT * FROM child').rows).toEqual([])
		expect(operations()).toEqual(['UPDATE','UPDATE','DELETE','DELETE'])
	})
	it('retains changes committed by a failing RAISE(FAIL) statement', () => {
		run('INSERT INTO items(id,stamp) VALUES(1,0),(2,0),(3,0)')
		run("CREATE TRIGGER fail_update BEFORE UPDATE ON items WHEN NEW.id=2 BEGIN SELECT RAISE(FAIL,'stop'); END")
		events.length = 0
		expect(() => run('UPDATE items SET stamp=1')).toThrow()
		expect(run('SELECT stamp FROM items ORDER BY id').rows).toEqual([[1],[0],[0]])
		expect(operations()).toEqual(['UPDATE'])
	})
	it('rejects transactions spanning RPCs, multi-statements and writable reactive queries', () => {
		expect(() => run('BEGIN')).toThrow()
		expect(() => run('SELECT 1; DELETE FROM items')).toThrow()
		expect(() => engine.watch('bad', { sql: 'DELETE FROM items RETURNING id' }, () => {})).toThrow()
		expect(run("SELECT ';' /* ; */;").rows).toEqual([[';']])
	})
})

describe('schema and subscription regressions', () => {
	it('retains delivered initial snapshots and does not erase them', () => {
		run('INSERT INTO items(id) VALUES(1)')
		let snapshot: WireUpdate | undefined
		engine.watch('snapshot', {table:'items'}, update => { snapshot = update })
		expect(snapshot).toMatchObject({ rows:[[1,null,0]] })
	})
	it('failed schema batches neither publish nor retain created tables', () => {
		expect(() => engine.batch([{sql:'CREATE TABLE aborted(id INTEGER PRIMARY KEY)'},{sql:'INSERT INTO missing VALUES(1)'}])).toThrow()
		expect(events).toEqual([])
		expect(run("SELECT name FROM sqlite_schema WHERE name='aborted'").rows).toEqual([])
	})
	it('refreshes dependencies after changing a view', () => {
		run('CREATE VIEW v AS SELECT id FROM items')
		const updates: WireUpdate[] = []
		engine.watch('view',{sql:'SELECT * FROM v'}, update => {updates.push(update)})
		engine.batch([{sql:'DROP VIEW v'},{sql:'CREATE VIEW v AS SELECT id FROM other'}])
		run('INSERT INTO other VALUES(9)')
		expect(updates.at(-1)).toMatchObject({rows:[[9]]})
		expect(engine.inspect().queries[0].tables).toContain('other')
	})
	it('suppresses unchanged SQL results and skips unrelated tables', () => {
		const updates: WireUpdate[] = []
		engine.watch('filtered',{sql:'SELECT id FROM items WHERE stamp=1'}, update => {updates.push(update)})
		run('INSERT INTO items(id) VALUES(1)')
		expect(updates).toHaveLength(1)
		const previous = engine.inspect().queryRuns
		run('INSERT INTO other VALUES(1)')
		expect(engine.inspect().queryRuns).toBe(previous)
	})
	it('falls back to reruns for nullable composite primary keys', () => {
		run('CREATE TABLE nullable(x INTEGER,y INTEGER,PRIMARY KEY(x,y))')
		const updates: WireUpdate[] = []
		engine.watch('nullable',{table:'nullable'}, update => {updates.push(update)})
		run('INSERT INTO nullable VALUES(NULL,1),(NULL,1)')
		expect(updates.at(-1)).toMatchObject({kind:'snapshot',rows:[[null,1],[null,1]]})
	})
	it('protects observation objects without deleting business triggers', () => {
		run('CREATE TABLE audit(id INTEGER)')
		run('CREATE TRIGGER trg_items_insert AFTER INSERT ON items BEGIN INSERT INTO audit VALUES(NEW.id); END')
		run('INSERT INTO items(id) VALUES(8)')
		expect(run('SELECT * FROM audit').rows).toEqual([[8]])
		expect(() => run('DROP TRIGGER temp._sqlite_sync_items_insert')).toThrow()
		expect(() => run('DROP TABLE temp._sqlite_sync_changes')).toThrow()
	})
	it('a deferred foreign-key commit failure rolls back data and events', () => {
		run('CREATE TABLE deferred(id INTEGER REFERENCES items(id) DEFERRABLE INITIALLY DEFERRED)')
		events.length = 0
		expect(() => engine.batch([{sql:'INSERT INTO deferred VALUES(999)'}])).toThrow()
		expect(run('SELECT * FROM deferred').rows).toEqual([])
		expect(events).toEqual([])
	})
	it('handles replacement deletes and trigger-generated changes', () => {
		run('INSERT INTO items(id,value) VALUES(1,\'a\')')
		events.length=0
		run("INSERT OR REPLACE INTO items(id,value) VALUES(1,'b')")
		expect(operations()).toEqual(['DELETE','INSERT'])
	})
})

it('tracks COUNT(*) table reads with SQLite\'s missing database authorizer argument', () => {
	const updates: WireUpdate[] = []
	engine.watch('count', { sql: 'SELECT count(*) FROM items' }, update => { updates.push(update) })
	run('INSERT INTO items(id) VALUES(1)')
	expect(updates.at(-1)).toMatchObject({ rows: [[1]] })
})

it('table renames reinstall observation without duplicate old-name changes', () => {
	engine.batch([{sql:'ALTER TABLE items RENAME TO renamed'},{sql:'INSERT INTO renamed(id) VALUES(1)'}])
	const commit=events[0]
	if(commit.kind!=='commit')throw new Error('missing commit')
	expect(commit.changes).toHaveLength(1)
	expect(commit.changes[0].table).toBe('renamed')
	expect(commit.totals.mutations).toBe(1)
})

it('durable logging does not double entries after a standalone table rename', () => {
	engine.close()
	const db=new sqlite.oo1.DB()
	db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY)')
	engine=new ReactiveEngine(sqlite,db,true)
	run('ALTER TABLE t RENAME TO renamed')
	run('INSERT INTO renamed VALUES(1)')
	expect(run('SELECT tbl_name FROM change_log').rows).toEqual([['renamed']])
})

it('no-op schema statements retain observation and readable argument PRAGMAs', () => {
	run('CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY)')
	events.length=0
	run('INSERT INTO items(id) VALUES(1)')
	expect(operations()).toEqual(['INSERT'])
	expect(run('PRAGMA table_info(items)').rows).toHaveLength(3)
})

it('DROP COLUMN works with temporary and durable observation restored', () => {
	engine.close()
	const db=new sqlite.oo1.DB()
	db.exec('CREATE TABLE a(id INTEGER PRIMARY KEY,value TEXT)')
	engine=new ReactiveEngine(sqlite,db,true)
	run('ALTER TABLE a DROP COLUMN value')
	run('INSERT INTO a VALUES(1)')
	expect(run('SELECT row_json FROM change_log').rows).toEqual([['{"id":1}']])
})

it('rowsAffected measures top-level DML rather than a previous write', () => {
	expect(run('INSERT INTO items(id) VALUES(1),(2),(3)').rowsAffected).toBe(3)
	expect(run('CREATE TABLE b(id INTEGER)').rowsAffected).toBe(0)
	expect(run('PRAGMA table_info(items)').rowsAffected).toBe(0)
	expect(run('EXPLAIN UPDATE items SET stamp=1').rowsAffected).toBe(0)
})

it('rejects runtime settings that would silently change query semantics', () => {
	expect(() => run('PRAGMA case_sensitive_like=ON')).toThrow(/authorized/)
	expect(() => run('PRAGMA reverse_unordered_selects=ON')).toThrow(/authorized/)
})

it('diagnostics count no-op commits without publishing no-op row events', () => {
	run('INSERT INTO items(id) VALUES(1)')
	events.length=0
	const before=engine.inspect().commits
	run('UPDATE items SET value=NULL WHERE id=1')
	expect(engine.inspect().commits).toBe(before+1)
	expect(events).toEqual([])
})

it('application tables named migrations and change_log remain reactive without durable logging', () => {
	run('CREATE TABLE migrations(id INTEGER PRIMARY KEY)')
	run('CREATE TABLE change_log(id INTEGER PRIMARY KEY)')
	const updates:WireUpdate[]=[]
	engine.watch('migrations',{table:'migrations'},update=>{updates.push(update)})
	engine.watch('log',{table:'change_log'},update=>{updates.push(update)})
	run('INSERT INTO migrations VALUES(1)')
	run('INSERT INTO change_log VALUES(2)')
	expect(updates.filter(update=>update.kind==='patch')).toHaveLength(2)
})

it('event identity uses an unshadowed rowid alias for keyless and nullable-key tables', () => {
	run('CREATE TABLE shadow(rowid INTEGER)')
	events.length=0
	run('INSERT INTO shadow VALUES(NULL),(NULL)')
	const event=events[0]
	if(event.kind!=='commit')throw new Error('missing changes')
	expect(event.changes.map(change=>change.key)).toEqual([{_rowid_:1},{_rowid_:2}])
})

it('preserves adjacent double values and SQL infinities in change keys and rows', () => {
	run('CREATE TABLE reals(id REAL PRIMARY KEY NOT NULL) WITHOUT ROWID')
	events.length=0
	run('INSERT INTO reals VALUES(1.0000000000000002),(1.0000000000000004),(1e999),(-1e999)')
	const event=events[0]
	if(event.kind!=='commit')throw new Error('missing changes')
	expect(event.changes.map(change=>change.row.id)).toEqual([1.0000000000000002,1.0000000000000004,Infinity,-Infinity])
})

it('detects collation and storage-type changes without cancelling SQL', () => {
	run('CREATE TABLE semantic(id INTEGER PRIMARY KEY, value COLLATE NOCASE)')
	run("INSERT INTO semantic VALUES(1,'a')")
	events.length=0
	run("UPDATE semantic SET value='A'")
	expect(operations()).toEqual(['UPDATE'])
	run('UPDATE semantic SET value=1')
	const updates:WireUpdate[]=[]
	engine.watch('type',{sql:'SELECT typeof(value) AS type FROM semantic'},update=>{updates.push(update)})
	run('UPDATE semantic SET value=1.0')
	expect(updates.at(-1)).toMatchObject({rows:[['real']]})
})

it('ordinary names resembling reserved SQLite prefixes remain observable', () => {
	run('CREATE TABLE sqliteRecords(id INTEGER PRIMARY KEY)')
	run('CREATE TABLE _sqliteXsyncYrows(id INTEGER PRIMARY KEY)')
	const updates:WireUpdate[]=[]
	engine.watch('name',{table:'sqliteRecords'},update=>{updates.push(update)})
	run('INSERT INTO sqliteRecords VALUES(1)')
	expect(updates.at(-1)).toMatchObject({kind:'patch',rows:[{key:{id:1},row:{id:1}}]})
})

it('patch rows match committed state for self-referential primary-key cascades', () => {
	run('CREATE TABLE nodes(id INTEGER PRIMARY KEY,parent INTEGER REFERENCES nodes(id) ON UPDATE CASCADE)')
	run('INSERT INTO nodes VALUES(1,1)')
	const updates:WireUpdate[]=[]
	engine.watch('nodes',{table:'nodes'},update=>{updates.push(update)})
	run('UPDATE nodes SET id=2 WHERE id=1')
	const update=updates.at(-1)
	if(update?.kind!=='patch')throw new Error('missing patch')
	expect(update.rows.at(-1)?.row).toEqual({id:2,parent:2})
})

it('chunks wide composite key refreshes below SQLite parameter limits', () => {
	const columns=Array.from({length:70},(_,i)=>`k${i}`)
	run(`CREATE TABLE wide(${columns.map(column=>`${column} INTEGER NOT NULL`).join(',')}, value INTEGER, PRIMARY KEY(${columns.join(',')}))`)
	run(`WITH RECURSIVE n(x) AS(VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<499) INSERT INTO wide SELECT ${columns.map((_,i)=>i?'0':'x').join(',')},0 FROM n`)
	const updates:WireUpdate[]=[]
	engine.watch('wide',{table:'wide'},update=>{updates.push(update)})
	run('UPDATE wide SET value=1')
	const update=updates.at(-1)
	if(update?.kind!=='patch')throw new Error('missing patch')
	expect(update.rows).toHaveLength(500)
	expect(update.rows.every(row=>row.row.value===1)).toBe(true)
})
