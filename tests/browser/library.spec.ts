import {test,expect} from '@playwright/test'

test('built library works without loading Solid', async ({page}) => {
	await page.goto('/tests/browser/index.html')
	const result=await page.evaluate(async()=>{
		const {openDatabase}=await import('/dist-lib/sqlite-sync.js')
		const db=openDatabase({name:'built-'+crypto.randomUUID(),storage:'memory'})
		try{await db.ready;return await db.execute('SELECT 42 AS answer')}
		finally{db.close()}
	})
	expect(result.rows).toEqual([[42]])
})
