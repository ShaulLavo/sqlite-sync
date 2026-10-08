import {test,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'

test('repeatable browser SQLite and reactive benchmarks',async({page})=>{
	let progress:Record<string,unknown>={}
	await mkdir('benchmarks/results',{recursive:true})
	page.on('console',message=>console.log(message.text()))
	await page.exposeFunction('benchmarkCheckpoint',async(checkpoint:Record<string,unknown>)=>{progress={...progress,...checkpoint};await writeFile('benchmarks/results/checkpoint.json',JSON.stringify(progress,null,2)+'\n')})
	await page.goto('/tests/browser/index.html')
	const result=await page.evaluate(async quick=>{
		const {runBenchmarks}=await import('/benchmarks/browser.ts')
		return runBenchmarks(quick)
	},Boolean(process.env.BENCH_QUICK))
	expect(result.reconciliation.verifiedRows).toBe(process.env.BENCH_QUICK?0:10_000)
	await mkdir('benchmarks/results',{recursive:true})
	await writeFile('benchmarks/results/latest.json',JSON.stringify(result,null,2)+'\n')
	console.log('SQLite and reactive benchmarks recorded in benchmarks/results/latest.json')
})

test('concurrent browser tabs share committed counter updates',async({page,context})=>{
	const other=await context.newPage()
	const options={name:'concurrent-'+crypto.randomUUID(),migrations:[{id:'base',sql:['CREATE TABLE counter(id INTEGER PRIMARY KEY, value INTEGER)','INSERT INTO counter VALUES(1,0)']}]}
	for(const tab of [page,other]){
		await tab.goto('/tests/browser/index.html')
		await tab.evaluate(async options=>{
			const h=await import('/tests/browser/harness.ts')
			await h.open(options)
			h.watchSql('SELECT value FROM counter')
		},options)
	}
	const start=performance.now()
	await Promise.all([page,other].map(tab=>tab.evaluate(async()=>{
		const h=await import('/tests/browser/harness.ts')
		for(let i=0;i<50;i++)await h.database.execute('UPDATE counter SET value=value+1 WHERE id=1')
	})))
	const elapsedMs=performance.now()-start
	for(const tab of [page,other])await expect.poll(()=>tab.evaluate(async()=>{
		const h=await import('/tests/browser/harness.ts')
		const state=h.updates.at(-1)
		return state?.status==='ready'?state.rows:[]
	})).toEqual([{value:100}])
	await mkdir('benchmarks/results',{recursive:true})
	await writeFile('benchmarks/results/concurrent.json',JSON.stringify({tabs:2,commits:100,elapsedMs,commitsPerSecond:100000/elapsedMs,finalValue:100},null,2)+'\n')
})
