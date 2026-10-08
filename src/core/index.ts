import { BrowserDatabase } from './client'
import type { DatabaseOptions, ReactiveDatabase } from './types'

export function openDatabase(options: DatabaseOptions = {}): ReactiveDatabase {
	return new BrowserDatabase(options)
}
export type { Change, CommitEvent, DatabaseEvent, DatabaseOptions, Inspection, LiveQuery, Migration, QueryResult, QuerySnapshot, ReactiveDatabase, Row, SqlValue, Statement, Unsubscribe } from './types'
