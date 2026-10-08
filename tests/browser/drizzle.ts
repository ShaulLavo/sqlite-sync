import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { eq, desc } from 'drizzle-orm'
import { openDatabase } from '../../src/core'
import { drizzleDriver, liveDrizzleQuery } from '../../src/adapters/drizzle'
import { migrationStatements } from '../../src/consts/migrations'
import * as schema from '../../src/demo/schema'

export async function verifyDrizzle() {
	const core = openDatabase({name:'drizzle-'+crypto.randomUUID(),storage:'memory',migrations:migrationStatements})
	try {
		await core.ready
		const {driver,batchDriver} = drizzleDriver(core)
		const db = drizzle(driver,batchDriver,{schema})
		const inserted = await db.insert(schema.users).values({name:'Ada',email:'ada@drizzle',isActive:false}).returning().get()
		const selected = await db.select().from(schema.users).where(eq(schema.users.id,inserted.id)).get()
		if(!selected)throw new Error('Drizzle get returned no row')
		await db.batch([db.update(schema.users).set({isActive:true,bio:null}).where(eq(schema.users.id,inserted.id)),db.select().from(schema.users)])
		const query = db.select({name:schema.users.name,active:schema.users.isActive}).from(schema.users).orderBy(desc(schema.users.id)).limit(1)
		let value:unknown
		const stop = liveDrizzleQuery(core,query).subscribe(snapshot=>{if(snapshot.status==='ready')value=snapshot.rows})
		await core.execute('SELECT 1')
		const start=performance.now()
		while(!value){if(performance.now()-start>2000)throw new Error('Drizzle query snapshot timeout');await new Promise(resolve=>setTimeout(resolve,0))}
		stop()
		return {selected,live:value,rows:await db.select().from(schema.users).all()}
	} finally {core.close()}
}
