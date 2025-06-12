import * as Comlink from 'comlink'
import { drizzle, SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import {
	createContext,
	onCleanup,
	useContext,
	type ParentComponent
} from 'solid-js'
import type { Api } from '../sqlite'
import * as schema from '../sqlite/schema'
import { getDrizzleDriver } from '../utils/drizzleDriver'
// import { SharedService, sharedWorker } from '../workers/sharedService'

const DbContext = createContext<{
	db: Promise<SqliteRemoteDatabase<typeof schema>>
	api: Api
}>()

function getDrizzleInstance(api: Api) {
	const { promise, resolve, reject } =
		Promise.withResolvers<SqliteRemoteDatabase<typeof schema>>()

	api.clientReady
		.then(async () => {
			console.log('client READY')
			const { driver, batchDriver } = getDrizzleDriver(api)
			const d = drizzle<typeof schema>(driver, batchDriver)
			resolve(d)
		})
		.catch(reject)

	return promise
}

const DbProvider: ParentComponent = props => {
	// const myService = new SharedService<Api>(
	// 	'myApi',
	// 	() => sharedWorker.port
	// )
	const worker = new Worker(new URL('../sqlite/index.ts', import.meta.url), {
		type: 'module'
	})
	const api = Comlink.wrap<Api>(worker)
	const db = getDrizzleInstance(api)
	onCleanup(() => {
		api.disconnect()
	})
	return (
		<DbContext.Provider value={{ db, api }}>
			{props.children}
		</DbContext.Provider>
	)
}

const useDb = () => {
	const context = useContext(DbContext)!
	if (!context) throw new Error('useDb must be used within a DbProvider')
	return { db: context.db, api: context.api }
}

export { DbProvider, useDb }
