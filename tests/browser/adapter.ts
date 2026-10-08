import {createRoot} from 'solid-js'
import {createLiveQuery} from '../../src/adapters/solid'
import {openDatabase} from '../../src/core'

export async function mappingFailure() {
	const database=openDatabase({name:'adapter-'+crypto.randomUUID(),storage:'memory',migrations:[{id:'base',sql:['CREATE TABLE a(id INTEGER PRIMARY KEY)','INSERT INTO a VALUES(1)']}]})
	await database.ready
	let dispose=()=>{}
	const query=createRoot(cleanup=>{dispose=cleanup;return createLiveQuery(database.liveTable('a'),{map:()=>{throw new Error('mapper failed')}})})
	try{
		const start=performance.now()
		while(query.loading()){if(performance.now()-start>2000)throw new Error('Adapter stuck loading');await new Promise(resolve=>setTimeout(resolve,0))}
		return {error:query.error()?.message,loading:query.loading()}
	}finally{dispose();database.close()}
}
