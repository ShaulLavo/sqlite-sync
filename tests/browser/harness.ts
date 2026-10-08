import { openDatabase } from '../../src/core'
import type { DatabaseOptions, QuerySnapshot, ReactiveDatabase } from '../../src/core'

export let database: ReactiveDatabase
export const updates: QuerySnapshot[] = []
let stop: (() => void) | undefined
export async function open(options: DatabaseOptions = {}) {
	database = openDatabase(options)
	await database.ready
	return database.inspect()
}
export function watchTable(table: string) {
	stop?.()
	updates.length = 0
	stop = database.liveTable(table).subscribe(update => { updates.push(update) })
}
export function watchSql(sql: string) {
	stop?.()
	updates.length = 0
	stop = database.liveQuery(sql).subscribe(update => { updates.push(update) })
}
export function unwatch() { stop?.(); stop = undefined }
export function close() { unwatch(); database.close() }
