import {test,expect} from '@playwright/test'

test('Solid mapping failures become visible adapter errors',async({page})=>{
	await page.goto('/tests/browser/index.html')
	const result=await page.evaluate(async()=> (await import('/tests/browser/adapter.ts')).mappingFailure())
	expect(result).toEqual({error:'mapper failed',loading:false})
})
