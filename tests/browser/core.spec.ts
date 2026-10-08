import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function open(page: Page, name: string, extra: Record<string, unknown> = {}) {
	await page.goto('/tests/browser/index.html')
	return page.evaluate(async ({ name, extra }) => {
		const harness = await import('/tests/browser/harness.ts')
		return harness.open({ name, ...extra, migrations: [{ id: 'base', sql: ['CREATE TABLE items(id INTEGER PRIMARY KEY, value TEXT)'] }] })
	}, { name, extra })
}
const unique = () => `browser-${crypto.randomUUID()}.db`

test('framework-neutral core runs real WASM with committed reactive updates', async ({ page }) => {
	await open(page, unique(), { storage: 'memory' })
	await page.evaluate(async () => {
		const h = await import('/tests/browser/harness.ts')
		h.watchTable('items')
		await h.database.batch([{ sql: "INSERT INTO items VALUES(1,'first')" }, { sql: "UPDATE items SET value='final'" }])
	})
	await expect.poll(() => page.evaluate(async () => {
		const h = await import('/tests/browser/harness.ts')
		const snapshot = h.updates.at(-1)
		return snapshot?.status === 'ready' ? snapshot.rows : []
	})).toEqual([{ id: 1, value: 'final' }])
	const result = await page.evaluate(async () => {
		const h = await import('/tests/browser/harness.ts')
		h.unwatch()
		await h.database.execute('SELECT 1')
		const inspected = await h.database.inspect()
		h.close()
		return inspected
	})
	expect(result.subscribers).toBe(0)
	expect(result.queueRows).toBe(0)
	expect(result.mutations).toBe(2)
})

test('shared tabs own one connection, survive first-tab closure and reload persisted data', async ({ context, page }) => {
	const name = unique()
	await open(page, name)
	const other = await context.newPage()
	await open(other, name)
	await other.evaluate(async () => (await import('/tests/browser/harness.ts')).watchTable('items'))
	await page.evaluate(async () => (await import('/tests/browser/harness.ts')).database.execute("INSERT INTO items VALUES(1,'persisted')"))
	await expect.poll(() => other.evaluate(async () => {
		const h = await import('/tests/browser/harness.ts')
		const latest = h.updates.at(-1)
		return latest?.status === 'ready' ? latest.rows.length : 0
	})).toBe(1)
	await page.close()
	await expect.poll(() => other.evaluate(async () => (await (await import('/tests/browser/harness.ts')).database.inspect()).sessions)).toBe(1)
	await other.evaluate(async () => (await import('/tests/browser/harness.ts')).database.execute("UPDATE items SET value='survivor'"))
	await other.reload()
	await other.evaluate(async name => {
		const h = await import('/tests/browser/harness.ts')
		await h.open({ name, migrations: [{id:'base',sql:['CREATE TABLE items(id INTEGER PRIMARY KEY, value TEXT)']}] })
	}, name)
	const result = await other.evaluate(async () => (await import('/tests/browser/harness.ts')).database.execute('SELECT * FROM items'))
	expect(result.rows).toEqual([[1,'survivor']])
})

test('exclusive fallback reports ownership conflicts and recovers after the owner exits', async ({ context, page }) => {
	const name = unique()
	await open(page, name, { ownership: 'exclusive' })
	const other = await context.newPage()
	await expect(open(other, name, { ownership: 'exclusive' })).rejects.toThrow(/in use/)
	await page.close()
	await open(other, name, { ownership: 'exclusive' })
	const result = await other.evaluate(async () => (await import('/tests/browser/harness.ts')).database.execute('SELECT count(*) FROM items'))
	expect(result.rows).toEqual([[0]])
})

test('initialization failure rejects operations and late disposal retains no subscriptions', async ({ page }) => {
	await page.goto('/tests/browser/index.html')
	const failed = await page.evaluate(async () => {
		const { openDatabase } = await import('/src/core/index.ts')
		const database = openDatabase({ name: 'bad-'+crypto.randomUUID(), storage:'memory', migrations:[{id:'bad',sql:['not valid SQL']}] })
		try { await database.ready; return 'unexpected success' }
		catch(error) { return String(error) }
	})
	expect(failed).toMatch(/syntax error/)
	await open(page, unique(), { storage:'memory' })
	const result = await page.evaluate(async () => {
		const h = await import('/tests/browser/harness.ts')
		for(let i=0;i<50;i++) h.database.liveTable('items').subscribe(() => {})()
		await h.database.execute('SELECT 1')
		return h.database.inspect()
	})
	expect(result.subscribers).toBe(0)
})

test('heavy writes maintain final state and preserve untouched row identities', async ({page}) => {
	await open(page,unique(),{storage:'memory'})
	await page.evaluate(async()=>{
		const h=await import('/tests/browser/harness.ts')
		await h.database.execute("WITH RECURSIVE n(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10000) INSERT INTO items SELECT x,'initial' FROM n")
		h.watchTable('items')
	})
	await expect.poll(()=>page.evaluate(async()=>{
		const h=await import('/tests/browser/harness.ts')
		const snapshot=h.updates.at(-1)
		return snapshot?.status==='ready'?snapshot.rows.length:0
	})).toBe(10000)
	await page.evaluate(async()=>{
		const h=await import('/tests/browser/harness.ts')
		await h.database.batch(Array.from({length:5000},(_,i)=>({sql:'UPDATE items SET value=? WHERE id=?',params:['updated',i+1]})))
	})
	await expect.poll(()=>page.evaluate(async()=>{
		const h=await import('/tests/browser/harness.ts')
		const snapshot=h.updates.at(-1)
		return snapshot?.status==='ready'?snapshot.rows.filter(row=>row.value==='updated').length:0
	})).toBe(5000)
	const identity=await page.evaluate(async()=>{
		const h=await import('/tests/browser/harness.ts')
		const ready=h.updates.filter(s=>s.status==='ready')
		const first=ready[0]
		const last=ready.at(-1)
		return first.rows[9999]===last?.rows[9999]
	})
	expect(identity).toBe(true)
})

test('worker termination refreshes subscriptions through ownership failover', async ({context,page})=>{
	const name=unique()
	await open(page,name)
	const other=await context.newPage()
	await open(other,name)
	await other.evaluate(async()=> (await import('/tests/browser/harness.ts')).watchSql('SELECT count(*) AS count FROM items'))
	// Closing the owner's context terminates its worker, without graceful database cleanup.
	await page.close()
	await expect.poll(()=>other.evaluate(async()=>{
		const h=await import('/tests/browser/harness.ts')
		const state=h.updates.at(-1)
		return state?.status==='ready'?state.rows:[]
	})).toEqual([{count:0}])
	await other.evaluate(async()=> (await import('/tests/browser/harness.ts')).database.execute("INSERT INTO items VALUES(1,'after failover')"))
	await expect.poll(()=>other.evaluate(async()=>{
		const h=await import('/tests/browser/harness.ts')
		const state=h.updates.at(-1)
		return state?.status==='ready'?state.rows:[]
	})).toEqual([{count:1}])
})

test('migrations cannot commit early and failed migrations leave no partial schema',async({page})=>{
	await page.goto('/tests/browser/index.html')
	const result=await page.evaluate(async()=>{
		const {openDatabase}=await import('/src/core/index.ts')
		const name='migration-'+crypto.randomUUID()
		const failing=openDatabase({name,migrations:[{id:'bad',sql:['CREATE TABLE leaked(id INTEGER)','COMMIT','CREATE TABLE second(id INTEGER)']}]})
		let error=''
		try{await failing.ready}catch(value){error=String(value)}finally{failing.close()}
		await new Promise(resolve=>setTimeout(resolve,25))
		const reopened=openDatabase({name})
		try{await reopened.ready;return {error,tables:await reopened.execute("SELECT name FROM sqlite_schema WHERE name IN ('leaked','second')")}}
		finally{reopened.close()}
	})
	expect(result.error).toMatch(/authorized/)
	expect(result.tables.rows).toEqual([])
})

test('closing a subscribed non-owner page releases its worker subscriptions',async({context,page})=>{
	const name=unique()
	await open(page,name)
	const other=await context.newPage()
	await open(other,name)
	await other.evaluate(async()=> (await import('/tests/browser/harness.ts')).watchTable('items'))
	await expect.poll(()=>page.evaluate(async()=> (await (await import('/tests/browser/harness.ts')).database.inspect()).subscribers)).toBe(1)
	await other.close()
	await expect.poll(()=>page.evaluate(async()=> (await (await import('/tests/browser/harness.ts')).database.inspect()).subscribers)).toBe(0)
})

test('shared worker load failures propagate the original error without restart loops',async({page})=>{
	let loads=0
	await page.route(/\/src\/core\/sqlite\.worker\.ts\?.*/,route=>{loads++;return route.fulfill({contentType:'application/javascript',body:"throw new Error('worker load failure sentinel')"})})
	await page.goto('/tests/browser/index.html')
	const error=await page.evaluate(async()=>{
		const {openDatabase}=await import('/src/core/index.ts')
		const database=openDatabase({name:'load-failure-'+crypto.randomUUID(),storage:'memory',timeoutMs:2000})
		try{await database.ready;return 'unexpected success'}catch(error){return String(error)}finally{database.close()}
	})
	expect(error).toContain('worker load failure sentinel')
	expect(loads).toBe(1)
})

test('semantically identical configuration shares ownership despite object key order',async({context,page})=>{
	const name=unique()
	await open(page,name)
	const other=await context.newPage()
	await other.goto('/tests/browser/index.html')
	const result=await other.evaluate(async name=>{
		const h=await import('/tests/browser/harness.ts')
		return h.open({migrations:[{sql:['CREATE TABLE items(id INTEGER PRIMARY KEY, value TEXT)'],id:'base'}],name,storage:undefined})
	},name)
	expect(result.sessions).toBe(2)
})
