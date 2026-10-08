import {test,expect} from '@playwright/test'

test('adopts existing libsql OPFS data and removes only legacy observation triggers',async({page})=>{
	await page.goto('/tests/browser/index.html')
	const result=await page.evaluate(async()=>{
		await (await import('/tests/browser/baseline.ts')).seedLegacy()
		const {connectDemo}=await import('/src/demo/database.ts')
		const db=connectDemo()
		try{
			await db.ready
			await db.execute("UPDATE users SET created_at='new' WHERE id=100")
			return {user:await db.execute('SELECT name,created_at FROM users WHERE id=100'),cells:await db.execute('SELECT * FROM cells'),triggers:await db.execute("SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE 'trg_%'")}
		}finally{db.close()}
	})
	expect(result.user.rows).toEqual([['Legacy','new']])
	expect(result.cells.rows).toEqual([[3,4,1]])
	expect(result.triggers.rows).toEqual([])
})
