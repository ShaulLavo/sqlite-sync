import init from '@sqlite.org/sqlite-wasm'
import {expect,it} from 'vitest'

it('real WASM hooks expose rolled-back changes and cannot be a raw reactive event log',async()=>{
	const sqlite=await init()
	const db=new sqlite.oo1.DB()
	const options=db.selectValues('PRAGMA compile_options')
	expect(options).toContain('ENABLE_PREUPDATE_HOOK')
	expect(options).toContain('ENABLE_SESSION')
	const changes:number[]=[]
	let rollbacks=0
	Reflect.apply(sqlite.capi.sqlite3_preupdate_hook,sqlite.capi,[db,(_:unknown,_pointer:unknown,op:number,_schema:string,table:string)=>{if(table==='t')changes.push(op)},0])
	sqlite.capi.sqlite3_rollback_hook(db,()=>{rollbacks++;return 0},0)
	try{
		db.exec('CREATE TABLE t(x INTEGER PRIMARY KEY,value); INSERT INTO t VALUES(1,NULL); SAVEPOINT a; UPDATE t SET value=42; ROLLBACK TO a; RELEASE a')
		expect(changes).toEqual([sqlite.capi.SQLITE_INSERT,sqlite.capi.SQLITE_UPDATE])
		expect(db.selectValue('SELECT value FROM t')).toBeNull()
		expect(rollbacks).toBe(0)
	}finally{
		Reflect.apply(sqlite.capi.sqlite3_preupdate_hook,sqlite.capi,[db,0,0])
		sqlite.capi.sqlite3_rollback_hook(db,0,0)
		db.close()
	}
})
