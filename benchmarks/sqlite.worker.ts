import init from '@sqlite.org/sqlite-wasm'
import * as Comlink from 'comlink'
import { ReactiveEngine } from '../src/core/engine'
import { generateAllTriggers } from './legacy/triggers'
import type { Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm'

type Query = {sql:string;params?:number[]}
type Strategy = 'bare' | 'legacy' | 'temporary' | 'temporary+durable' | 'native-probe'
const strategies: Strategy[] = ['bare','legacy','temporary','temporary+durable','native-probe']
const rounds = 7
const median = (values: number[]) => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]
function execute(db: Database, sql: string, params?:number[]) {
	const stmt = db.prepare(sql)
	try { if(params?.length)stmt.bind(params);while(stmt.step()) {} } finally { stmt.finalize() }
}

async function install(db: Database, sqlite: Sqlite3Static, strategy: Strategy) {
	if (strategy === 'temporary' || strategy === 'temporary+durable') {
		const engine = new ReactiveEngine(sqlite,db,strategy === 'temporary+durable')
		return { execute:(sql: string)=>engine.execute({sql}), batch:(queries:Query[])=>engine.batch(queries), close:()=>engine.close() }
	}
	let pending: unknown[][] = []
	let cursor = 0
	if(strategy==='legacy') await generateAllTriggers({ execute: async (sql: string) => { db.exec(sql) } })
	if(strategy==='native-probe') {
		Reflect.apply(sqlite.capi.sqlite3_preupdate_hook, sqlite.capi, [db, (_:unknown,pointer:number,op:number,_schema:string,table:string)=>{
			if(table!=='users'&&table!=='cells') return
			const count=sqlite.capi.sqlite3_preupdate_count(pointer)
			const row=Array.from({length:count},(_,i)=>op===sqlite.capi.SQLITE_DELETE?sqlite.capi.sqlite3_preupdate_old_js(pointer,i):sqlite.capi.sqlite3_preupdate_new_js(pointer,i))
			pending.push(row)
		},0])
	}
	const notify=()=>{
		if(strategy==='legacy') {
			const rows=db.selectObjects('SELECT * FROM change_log WHERE id>? ORDER BY id DESC',[cursor])
			if(rows.length) cursor=Number(rows[0].id)
		}
		pending=[]
	}
	return {
		execute:(sql:string)=>{execute(db,sql);notify()},
		batch:(queries:Query[])=>{db.exec('BEGIN');for(const query of queries) execute(db,query.sql,query.params);db.exec('COMMIT');notify()},
		close:()=>db.close()
	}
}

async function benchmark(onlyBatch = false) {
	const sqlite=await init()
	const pool=await sqlite.installOpfsSAHPoolVfs({name:`benchmark-${crypto.randomUUID()}`,initialCapacity:4})
	const results=[]
	for(const strategy of strategies) {
		const db=new pool.OpfsSAHPoolDb(`/${strategy}.db`)
		db.exec(`CREATE TABLE cells(x INTEGER NOT NULL,y INTEGER NOT NULL,alive INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(x,y)); CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL,picture TEXT,bio TEXT,location TEXT,created_at TEXT,is_active INTEGER); CREATE TABLE posts(id INTEGER PRIMARY KEY,author_id INTEGER,title TEXT,body TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE migrations(name TEXT PRIMARY KEY,applied_at TEXT); CREATE TABLE change_log(id INTEGER PRIMARY KEY AUTOINCREMENT,tbl_name TEXT,op_type TEXT,pk_json TEXT,row_json TEXT,changed_at TEXT DEFAULT CURRENT_TIMESTAMP)`)
		const api=await install(db,sqlite,strategy)
		allocation(sqlite,true)
		api.execute('WITH RECURSIVE n(x) AS(VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<4999) INSERT INTO cells SELECT x,0,0 FROM n')
		const workloads=[
			{name:'single insert/update/delete x100',rows:300,run:()=>{for(let i=0;i<100;i++){api.execute(`INSERT INTO users(name,email,is_active) VALUES('a','${i}',1)`);api.execute("UPDATE users SET name='b' WHERE id=last_insert_rowid()");api.execute('DELETE FROM users')}}},
			{name:'5000-row bulk update',rows:5000,run:()=>api.execute('UPDATE cells SET alive=1-alive')},
			{name:'1000 statements / transaction',rows:1000,run:()=>api.batch(Array.from({length:1000},(_,i)=>({sql:`UPDATE cells SET alive=1-alive WHERE x=${i} AND y=0`})))},
			{name:'1000 parameterized statements / transaction',rows:1000,run:()=>api.batch(Array.from({length:1000},(_,i)=>({sql:'UPDATE cells SET alive=1-alive WHERE x=? AND y=0',params:[i]})))},
			{name:'5000-row replacement insert',rows:10000,run:()=>{api.execute('DELETE FROM users');api.execute("WITH RECURSIVE n(x) AS(VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<4999) INSERT INTO users(name,email,is_active) SELECT 'a',x,1 FROM n")}}
		]
		for(const workload of workloads) {
			if(onlyBatch && !workload.name.includes('/ transaction')) continue
			workload.run()
			const samples=[]
			for(let i=0;i<rounds;i++){const start=performance.now();workload.run();samples.push(performance.now()-start)}
			results.push({strategy,workload:workload.name,rows:workload.rows,medianMs:median(samples),minMs:Math.min(...samples),maxMs:Math.max(...samples),samples})
		}
		results.push({strategy,workload:'SQLite allocator',...allocation(sqlite,false)})
		api.close()
		pool.unlink(`/${strategy}.db`)
	}
	await pool.removeVfs()
	return { sqlite:sqlite.capi.sqlite3_libversion(), rounds, storage:'OPFS SAH pool', wasmHeapBytes:sqlite.wasm.heap8u().byteLength, results }
}
Comlink.expose({benchmark})

function allocation(sqlite:Sqlite3Static, reset:boolean) {
	const scope=sqlite.wasm.scopedAllocPush()
	try {
		const [current,peak]=sqlite.wasm.scopedAllocPtr(2,true)
		const status=sqlite.capi.sqlite3_status64(sqlite.capi.SQLITE_STATUS_MEMORY_USED,current,peak,reset?1:0)
		if(status)throw new Error('SQLite allocator metrics unavailable')
		return {currentBytes:Number(sqlite.wasm.peek(current,'i64')),peakBytes:Number(sqlite.wasm.peek(peak,'i64'))}
	}finally{sqlite.wasm.scopedAllocPop(scope)}
}
