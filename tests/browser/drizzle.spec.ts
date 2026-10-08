import {test,expect} from '@playwright/test'

test('Drizzle get/all/returning/batch and reactive toSQL are compatible',async({page})=>{
	await page.goto('/tests/browser/index.html')
	const result=await page.evaluate(async()=> (await import('/tests/browser/drizzle.ts')).verifyDrizzle())
	expect(result.selected.name).toBe('Ada')
	expect(result.selected.isActive).toBe(false)
	expect(result.selected.bio).toBeNull()
	expect(result.live).toEqual([{name:'Ada',is_active:1}])
	expect(result.rows[0].isActive).toBe(true)
})
