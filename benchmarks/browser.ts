import * as Comlink from 'comlink'
import { openDatabase } from '../src/core'
import type { Api } from './legacy/worker'
import { createRoot } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import type { Change } from '../src/core'
import { createLiveQuery } from '../src/adapters/solid'
import { migrationStatements } from '../src/consts/migrations'
const median=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]
const p95=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*0.95)-1]
const wait=async(predicate:()=>boolean)=>{const start=performance.now();while(!predicate()){if(performance.now()-start>10_000)throw new Error('Benchmark notification timeout');await new Promise(resolve=>setTimeout(resolve,0))}}

async function transport(strategy:'legacy'|'new',subscribers:number,tables:'same'|'different') {
	const worker=strategy==='legacy'?new Worker(new URL('./legacy/worker.ts',import.meta.url),{type:'module'}):undefined
	const legacy=worker?Comlink.wrap<Api>(worker):undefined
	const modern=legacy?undefined:openDatabase({name:`benchmark-client-${crypto.randomUUID()}.db`,migrations:migrationStatements,durableLog:false})
	let notifications=0
	const callbacks:(()=>void)[]=[]
	const execute=async(sql:string)=>legacy?legacy.driver(sql,[],'all'):modern!.execute(sql)
	try {
		if(legacy) await Promise.race([legacy.clientReady,new Promise<never>((_,reject)=>{worker!.addEventListener('error',event=>reject(new Error(event.message)));setTimeout(()=>reject(new Error('Legacy benchmark worker initialization timed out')),10000)})])
		else await modern!.ready
		await execute('DELETE FROM users')
		await execute('DELETE FROM cells')
		await execute('INSERT INTO cells VALUES(0,0,0)')
		for(let i=0;i<subscribers;i++) {
			const table=tables==='different'&&i%2?'cells':'users'
			if(legacy) callbacks.push(await legacy.subscribeToTable(table,Comlink.proxy(()=>{notifications++})))
			else callbacks.push(modern!.liveTable(table).subscribe(state=>{if(state.status==='ready') notifications++}))
		}
		if(modern) await wait(()=>notifications===subscribers)
		notifications=0
		const latencies=[]
		const mutations=[]
		for(let i=0;i<100;i++) {
			const previous=notifications
			const start=performance.now()
			await execute(`INSERT INTO users(name,email) VALUES('test','test-${i}@benchmark')`)
			mutations.push(performance.now()-start)
			const expected=tables==='different'?Math.ceil(subscribers/2):subscribers
			if(expected)await wait(()=>notifications>=previous+expected)
			latencies.push(performance.now()-start)
		}
		const reads=[]
		for(let i=0;i<100;i++){const start=performance.now();await execute('SELECT 1');reads.push(performance.now()-start)}
		return {strategy,subscribers,tables,mutationP50Ms:median(mutations),notificationP50Ms:median(latencies),notificationP95Ms:p95(latencies),roundTripP50Ms:median(reads),notifications}
	} finally {
		for(const unsubscribe of callbacks) unsubscribe()
		worker?.terminate()
		modern?.close()
	}
}

async function reconciliation() {
	const db=openDatabase({name:'reconcile-'+crypto.randomUUID(),storage:'memory',migrations:[{id:'base',sql:['CREATE TABLE items(id INTEGER PRIMARY KEY, value INTEGER)']}]})
	await db.ready
	await db.execute('WITH RECURSIVE n(x) AS(VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<9999) INSERT INTO items SELECT x,0 FROM n')
	let dispose=()=>{}
	let incoming:Change[]=[]
	const stopEvents=db.subscribeEvents(event=>{if(event.kind==='commit')incoming=event.changes})
	const [legacyRows,setLegacyRows]=createStore(Array.from({length:10000},(_,id)=>({id,value:0})))
	const query=createRoot(cleanup=>{dispose=cleanup;return createLiveQuery(db.liveTable('items'),{map:row=>({id:Number(row.id),value:Number(row.value)})})})
	try {
		await wait(()=>!query.loading())
		const samples=[]
		const legacySamples=[]
		for(let i=0;i<3;i++) {
			const old=query.updates()
			incoming=[]
			await db.execute('UPDATE items SET value=1-value WHERE id>=9000')
			await wait(()=>query.updates()>old && incoming.length===1000)
			samples.push(query.reconciliationMs())
			const encoded=incoming.map(change=>JSON.stringify(change.row))
			const start=performance.now()
			for(const json of encoded){
				const changed=JSON.parse(json)
				setLegacyRows(produce(rows=>{const index=rows.findIndex(row=>row.id===changed.id);if(index!==-1)rows[index]=changed}))
			}
			legacySamples.push(performance.now()-start)
			console.log('reconciliation sample',i,legacySamples.at(-1),'ms legacy',samples.at(-1),'ms new')
			if(legacyRows[9999].value!==query.rows[9999].value)throw new Error('Legacy reconciliation comparison diverged')
		}
		return {collectionRows:10_000,changedRowsPerCommit:1000,adapterReconciliationP50Ms:median(samples),adapterReconciliationP95Ms:p95(samples),legacyReconciliationP50Ms:median(legacySamples),legacyReconciliationP95Ms:p95(legacySamples),verifiedRows:query.rows.length,inspection:await db.inspect()}
	}finally{stopEvents();dispose();db.close()}
}

export async function runBenchmarks(quick = false) {
	const worker=new Worker(new URL('./sqlite.worker.ts',import.meta.url),{type:'module'})
	try {
		const checkpoint:unknown=Reflect.get(globalThis, 'benchmarkCheckpoint')
		const sqlite=await Comlink.wrap<{benchmark(quick:boolean):Promise<unknown>}>(worker).benchmark(quick)
		if(quick) return {sqlite, communication:[], reconciliation:{verifiedRows:0}}
		if(typeof checkpoint==='function')await checkpoint({sqlite})
		const communication=[]
		for(const strategy of ['legacy','new'] as const) for(const subscribers of [1,20]) for(const tables of ['same','different'] as const) {communication.push(await transport(strategy,subscribers,tables));if(typeof checkpoint==='function')await checkpoint({communication})}
		return {environment:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,time:new Date().toISOString()},sqlite,communication,reconciliation:await reconciliation(), joins:await joinedQuery()}
	}finally{worker.terminate()}
}

async function joinedQuery() {
	const db=openDatabase({name:'joins-'+crypto.randomUUID(),storage:'memory',migrations:[{id:'base',sql:[
		'CREATE TABLE owners(id INTEGER PRIMARY KEY,name TEXT)',
		'CREATE TABLE entries(id INTEGER PRIMARY KEY,owner INTEGER REFERENCES owners(id))',
		'CREATE INDEX entries_owner ON entries(owner)'
	]}]})
	await db.ready
	await db.batch([
		{sql:"WITH RECURSIVE n(x) AS(VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<4999) INSERT INTO owners SELECT x,'owner'||x FROM n"},
		{sql:'WITH RECURSIVE n(x) AS(VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<9999) INSERT INTO entries SELECT x,x%5000 FROM n'}
	])
	let deliveries=0
	const stop=db.liveQuery('SELECT o.id,o.name,count(e.id) AS entries FROM owners o LEFT JOIN entries e ON e.owner=o.id WHERE o.id<1000 GROUP BY o.id ORDER BY entries DESC,o.id LIMIT 100').subscribe(state=>{if(state.status==='ready')deliveries++})
	const samples:{executionMs:number;observationMs:number;queryMs:number}[]=[]
	const stopEvents=db.subscribeEvents(event=>{if(event.kind==='commit')samples.push({executionMs:event.executionMs,observationMs:event.observationMs,queryMs:event.queryMs})})
	try{
		await wait(()=>deliveries>0)
		for(let i=0;i<10;i++){
			await db.execute('UPDATE entries SET owner=(owner+1)%5000 WHERE id<500')
			await wait(()=>samples.length===i+1)
		}
		return {owners:5000,entries:10000,changedRowsPerCommit:500,commits:10,deliveries,executionP50Ms:median(samples.map(x=>x.executionMs)),observationP50Ms:median(samples.map(x=>x.observationMs)),queryP50Ms:median(samples.map(x=>x.queryMs)),inspection:await db.inspect()}
	}finally{stop();stopEvents();db.close()}
}
